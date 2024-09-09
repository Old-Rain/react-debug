/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

// UpdateQueue is a linked list of prioritized updates.
//
// Like fibers, update queues come in pairs: a current queue, which represents
// the visible state of the screen, and a work-in-progress queue, which can be
// mutated and processed asynchronously before it is committed — a form of
// double buffering. If a work-in-progress render is discarded before finishing,
// we create a new work-in-progress by cloning the current queue.
//
// Both queues share a persistent, singly-linked list structure. To schedule an
// update, we append it to the end of both queues. Each queue maintains a
// pointer to first update in the persistent list that hasn't been processed.
// The work-in-progress pointer always has a position equal to or greater than
// the current queue, since we always work on that one. The current queue's
// pointer is only updated during the commit phase, when we swap in the
// work-in-progress.
//
// For example:
//
//   Current pointer:           A - B - C - D - E - F
//   Work-in-progress pointer:              D - E - F
//                                          ^
//                                          The work-in-progress queue has
//                                          processed more updates than current.
//
// The reason we append to both queues is because otherwise we might drop
// updates without ever processing them. For example, if we only add updates to
// the work-in-progress queue, some updates could be lost whenever a work-in
// -progress render restarts by cloning from current. Similarly, if we only add
// updates to the current queue, the updates will be lost whenever an already
// in-progress queue commits and swaps with the current queue. However, by
// adding to both queues, we guarantee that the update will be part of the next
// work-in-progress. (And because the work-in-progress queue becomes the
// current queue once it commits, there's no danger of applying the same
// update twice.)
//
// Prioritization
// --------------
//
// Updates are not sorted by priority, but by insertion; new updates are always
// appended to the end of the list.
//
// The priority is still important, though. When processing the update queue
// during the render phase, only the updates with sufficient priority are
// included in the result. If we skip an update because it has insufficient
// priority, it remains in the queue to be processed later, during a lower
// priority render. Crucially, all updates subsequent to a skipped update also
// remain in the queue *regardless of their priority*. That means high priority
// updates are sometimes processed twice, at two separate priorities. We also
// keep track of a base state, that represents the state before the first
// update in the queue is applied.
//
// For example:
//
//   Given a base state of '', and the following queue of updates
//
//     A1 - B2 - C1 - D2
//
//   where the number indicates the priority, and the update is applied to the
//   previous state by appending a letter, React will process these updates as
//   two separate renders, one per distinct priority level:
//
//   First render, at priority 1:
//     Base state: ''
//     Updates: [A1, C1]
//     Result state: 'AC'
//
//   Second render, at priority 2:
//     Base state: 'A'            <-  The base state does not include C1,
//                                    because B2 was skipped.
//     Updates: [B2, C1, D2]      <-  C1 was rebased on top of B2
//     Result state: 'ABCD'
//
// Because we process updates in insertion order, and rebase high priority
// updates when preceding updates are skipped, the final result is deterministic
// regardless of priority. Intermediate state may vary according to system
// resources, but the final state is always the same.

import type {Fiber} from './ReactInternalTypes';
import type {Lanes, Lane} from './ReactFiberLane';

import {NoLane, NoLanes, isSubsetOfLanes, mergeLanes} from './ReactFiberLane';
import {
  enterDisallowedContextReadInDEV,
  exitDisallowedContextReadInDEV,
} from './ReactFiberNewContext.old';
import {Callback, ShouldCapture, DidCapture} from './ReactFiberFlags';

import {debugRenderPhaseSideEffectsForStrictMode} from 'shared/ReactFeatureFlags';

import {StrictMode} from './ReactTypeOfMode';
import {markSkippedUpdateLanes} from './ReactFiberWorkLoop.old';

import invariant from 'shared/invariant';

import {disableLogs, reenableLogs} from 'shared/ConsolePatchingDev';

export type Update<State> = {|
  // TODO: Temporary field. Will remove this by storing a map of
  // transition -> event time on the root.
  eventTime: number,
  lane: Lane,

  tag: 0 | 1 | 2 | 3,
  payload: any,
  callback: (() => mixed) | null,

  next: Update<State> | null,
|};

type SharedQueue<State> = {|
  pending: Update<State> | null,
|};

export type UpdateQueue<State> = {|
  baseState: State,
  firstBaseUpdate: Update<State> | null,
  lastBaseUpdate: Update<State> | null,
  shared: SharedQueue<State>,
  effects: Array<Update<State>> | null,
|};

export const UpdateState = 0;
export const ReplaceState = 1;
export const ForceUpdate = 2;
export const CaptureUpdate = 3;

// Global state that is reset at the beginning of calling `processUpdateQueue`.
// It should only be read right after calling `processUpdateQueue`, via
// `checkHasForceUpdateAfterProcessing`.
let hasForceUpdate = false;

let didWarnUpdateInsideUpdate;
let currentlyProcessingQueue;
export let resetCurrentlyProcessingQueue;
if (__DEV__) {
  didWarnUpdateInsideUpdate = false;
  currentlyProcessingQueue = null;
  resetCurrentlyProcessingQueue = () => {
    currentlyProcessingQueue = null;
  };
}

export function initializeUpdateQueue<State>(fiber: Fiber): void {
  const queue: UpdateQueue<State> = {
    baseState: fiber.memoizedState, // 本次更新前 fiber 的 state。本次更新最终的 state 是基于 baseState 以及拥有足够优先级的 Update 计算得出
    firstBaseUpdate: null,
    lastBaseUpdate: null,
    // firstBaseUpdate 和 lastBaseUpdate 保存了本次更新前 fiber 已保存的 Update
    // 这些 Update 同样以链表的形式存在，firstBaseUpdate 为链表头，lastBaseUpdate为链表尾
    // 之所以在更新前 fiber 内就存在 Update，是由于某些 Update 优先级较低
    // 所以在上次 render 阶段，由 Update 计算 state 时被跳过
    
    shared: {
      pending: null, // 保存本次更新时，Update 形成的环状链表。当 Update 计算 state 时，这个环会被剪开，并连接在 lastBaseUpdate 后面
    },
    effects: null, // 数组。
    // 如果 updateQueue 保存的 Update 链表中，某个 Update 存在 callback （update.callback !== null）
    // 那么这个 callback 就会保存到 effects
  };
  fiber.updateQueue = queue;
}

export function cloneUpdateQueue<State>(
  current: Fiber,
  workInProgress: Fiber,
): void {
  // Clone the update queue from current. Unless it's already a clone.
  const queue: UpdateQueue<State> = (workInProgress.updateQueue: any);
  const currentQueue: UpdateQueue<State> = (current.updateQueue: any);
  if (queue === currentQueue) {
    const clone: UpdateQueue<State> = {
      baseState: currentQueue.baseState,
      firstBaseUpdate: currentQueue.firstBaseUpdate,
      lastBaseUpdate: currentQueue.lastBaseUpdate,
      shared: currentQueue.shared,
      effects: currentQueue.effects,
    };
    workInProgress.updateQueue = clone;
  }
}

export function createUpdate(eventTime: number, lane: Lane): Update<*> {
  const update: Update<*> = {
    eventTime, // 任务时间，通过 performance.now() 获取毫秒数。该字段会在未来重构，不需要关注
    lane, // 优先级相关字段。不同 Update 的优先级可能不同

    tag: UpdateState, // 更新类型。枚举值 UpdateState | ReplaceState | ForceUpdate | CaptureUpdate
    payload: null, // 更新挂载的数据。
    // class组件的 payload 是 this.setState 的第一个参数，可以是对象也可以是回调函数
    // HostRoot的 payload 为 ReactDOM.render 的第一个参数，即要渲染的组件
    callback: null, // 更新的回调。即 commit 阶段的 layout 阶段提到的回调函数
    // this.setState 的第一个参数；或者 ReactDOM.render 的第三个参数

    next: null, // 指向其他 Update 对象，形成链表
  };
  return update;
}

// 为 update 环添加新的 update
export function enqueueUpdate<State>(fiber: Fiber, update: Update<State>) {
  const updateQueue = fiber.updateQueue; // 从传入的 fiber 取 updateQueue
  if (updateQueue === null) {
    // Only occurs if the fiber has been unmounted.
    return;
  }

  const sharedQueue: SharedQueue<State> = (updateQueue: any).shared; // 从 updateQueue 取 shared
  const pending = sharedQueue.pending;  // 从 shared 取 pending （update 环）
  if (pending === null) {
    // This is the first update. Create a circular list.
    update.next = update; // pending 为 null，传入的 update.next 指向自己
  } else {
    update.next = pending.next; // pending 不为 null，传入的 update.next 指向 pending.next
    pending.next = update; // pending.next 指向 update

    // pending.next 可能指向自己，也可能指向另一个 update 对象（后面简称 another）
    // 如果是指向自己 update.next = pending; pending.next = update
    // 如果指向 another，update.next = another; (another.next = pending 已经存在); pending.next = update
    // 最终形成环

    // pending.next 指向自己
    // update → next      pending → next        update → next
    //           ↓     +    ↑        ↓    =      ↑       ↓
    //          null          ——————————           next ← pending

    // pending.next 指向 another           
    // update → next      pending → next            update → next                 update → next
    //           ↓     +    ↑        ↓     =                  ↓                    ↑       ↓
    //          null        next ← another           next  → another       →      next    another
    //                                                  ↑       ↓                   ↑        ↓
    //                                               pending ← next                pending ← next
    //                                         （update.next = pending.next）   （pending.next = update）


    // 传入的 update 不能是环，否则
    // update → next      pending → next         a → next → b → next →  update → next
    //  ↑       ↓         ↑        ↓                                        ↑       ↓
    // next      a     +   next ← another   =                                next     another
    //  ↑       ↓                                                             ↑       ↓
    //  b  ←   next                                                         pending ← next
    // 
  }
  sharedQueue.pending = update; // 最后将新的 update 环赋值到 sharedQueue.pending

  if (__DEV__) {
    if (
      currentlyProcessingQueue === sharedQueue &&
      !didWarnUpdateInsideUpdate
    ) {
      console.error(
        'An update (setState, replaceState, or forceUpdate) was scheduled ' +
          'from inside an update function. Update functions should be pure, ' +
          'with zero side-effects. Consider using componentDidUpdate or a ' +
          'callback.',
      );
      didWarnUpdateInsideUpdate = true;
    }
  }
}

export function enqueueCapturedUpdate<State>(
  workInProgress: Fiber,
  capturedUpdate: Update<State>,
) {
  // Captured updates are updates that are thrown by a child during the render
  // phase. They should be discarded if the render is aborted. Therefore,
  // we should only put them on the work-in-progress queue, not the current one.
  let queue: UpdateQueue<State> = (workInProgress.updateQueue: any);

  // Check if the work-in-progress queue is a clone.
  const current = workInProgress.alternate;
  if (current !== null) {
    const currentQueue: UpdateQueue<State> = (current.updateQueue: any);
    if (queue === currentQueue) {
      // The work-in-progress queue is the same as current. This happens when
      // we bail out on a parent fiber that then captures an error thrown by
      // a child. Since we want to append the update only to the work-in
      // -progress queue, we need to clone the updates. We usually clone during
      // processUpdateQueue, but that didn't happen in this case because we
      // skipped over the parent when we bailed out.
      let newFirst = null;
      let newLast = null;
      const firstBaseUpdate = queue.firstBaseUpdate;
      if (firstBaseUpdate !== null) {
        // Loop through the updates and clone them.
        let update = firstBaseUpdate;
        do {
          const clone: Update<State> = {
            eventTime: update.eventTime,
            lane: update.lane,

            tag: update.tag,
            payload: update.payload,
            callback: update.callback,

            next: null,
          };
          if (newLast === null) {
            newFirst = newLast = clone;
          } else {
            newLast.next = clone;
            newLast = clone;
          }
          update = update.next;
        } while (update !== null);

        // Append the captured update the end of the cloned list.
        if (newLast === null) {
          newFirst = newLast = capturedUpdate;
        } else {
          newLast.next = capturedUpdate;
          newLast = capturedUpdate;
        }
      } else {
        // There are no base updates.
        newFirst = newLast = capturedUpdate;
      }
      queue = {
        baseState: currentQueue.baseState,
        firstBaseUpdate: newFirst,
        lastBaseUpdate: newLast,
        shared: currentQueue.shared,
        effects: currentQueue.effects,
      };
      workInProgress.updateQueue = queue;
      return;
    }
  }

  // Append the update to the end of the list.
  const lastBaseUpdate = queue.lastBaseUpdate;
  if (lastBaseUpdate === null) {
    queue.firstBaseUpdate = capturedUpdate;
  } else {
    lastBaseUpdate.next = capturedUpdate;
  }
  queue.lastBaseUpdate = capturedUpdate;
}

// 基于 Update 通过 newState 计算新的 state 赋值到 newState
function getStateFromUpdate<State>(
  workInProgress: Fiber,
  queue: UpdateQueue<State>,
  update: Update<State>,
  prevState: State,
  nextProps: any,
  instance: any,
): any {
  switch (update.tag) {
    case ReplaceState: {
      const payload = update.payload;
      if (typeof payload === 'function') {
        // Updater function
        if (__DEV__) {
          enterDisallowedContextReadInDEV();
        }
        const nextState = payload.call(instance, prevState, nextProps);
        if (__DEV__) {
          if (
            debugRenderPhaseSideEffectsForStrictMode &&
            workInProgress.mode & StrictMode
          ) {
            disableLogs();
            try {
              payload.call(instance, prevState, nextProps);
            } finally {
              reenableLogs();
            }
          }
          exitDisallowedContextReadInDEV();
        }
        return nextState;
      }
      // State object
      return payload;
    }
    case CaptureUpdate: {
      workInProgress.flags =
        (workInProgress.flags & ~ShouldCapture) | DidCapture;
    }
    // Intentional fallthrough
    case UpdateState: {
      const payload = update.payload;
      let partialState;
      if (typeof payload === 'function') {
        // Updater function
        if (__DEV__) {
          enterDisallowedContextReadInDEV();
        }
        // 如果 payload 是函数
        // partialState 就等于 payload 的执行结果
        partialState = payload.call(instance, prevState, nextProps);
        if (__DEV__) {
          if (
            debugRenderPhaseSideEffectsForStrictMode &&
            workInProgress.mode & StrictMode
          ) {
            disableLogs();
            try {
              payload.call(instance, prevState, nextProps);
            } finally {
              reenableLogs();
            }
          }
          exitDisallowedContextReadInDEV();
        }
      } else {
        // Partial state object
        partialState = payload;
      }
      if (partialState === null || partialState === undefined) {
        // Null and undefined are treated as no-ops.
        return prevState;
      }

      // 最后返回 prevState 和 partialState 合并后的对象
      // Merge the partial state and the previous state.
      return Object.assign({}, prevState, partialState);
    }
    case ForceUpdate: {
      hasForceUpdate = true;
      return prevState;
    }
  }
  return prevState;
}

// 通过 baseState 和 Update 计算得到新的 state
export function processUpdateQueue<State>(
  workInProgress: Fiber,
  props: any,
  instance: any,
  renderLanes: Lanes,
): void {
  // This is always non-null on a ClassComponent or HostRoot
  const queue: UpdateQueue<State> = (workInProgress.updateQueue: any);

  hasForceUpdate = false;

  if (__DEV__) {
    currentlyProcessingQueue = queue.shared;
  }

  // 先从 fiber 上获取已经存在的 Update
  let firstBaseUpdate = queue.firstBaseUpdate;
  let lastBaseUpdate = queue.lastBaseUpdate;

  // Check if there are pending updates. If so, transfer them to the base queue.
  let pendingQueue = queue.shared.pending; // 判断是否有新产生的 Update
  if (pendingQueue !== null) { // 如果有新产生的 Update
    queue.shared.pending = null; // 先清空 queue.shared.pending
    // 表示新产生的 Update，会在下面的操作中添加到链表，下次再走到这里，不会重复添加，也不会遗漏

    // The pending queue is circular. Disconnect the pointer between first
    // and last so that it's non-circular.
    const lastPendingUpdate = pendingQueue;
    const firstPendingUpdate = lastPendingUpdate.next; // 环状链表，最后一个 Update 的 next 就是第一个 Update
    lastPendingUpdate.next = null; // 将尾 Update 的 next 指向首 Update 的结构剪开，环变成单向链表
    // 如果 queue.shared.pending 中只有一个 Update，剪开的过程就是 U1 → U1 => U1 → null
    // 如果 queue.shared.pending 中只有多个 Update，剪开的过程就是 U1 → U2 → ... → Un → U1 => U1 → U2 → ... → Un → null

    // Append pending updates to base queue
    if (lastBaseUpdate === null) {
      // workInProgress.updateQueue.lastBaseUpdate 为 null
      // 说明 workInProgress.updateQueue 在上次 render 被打断或 commit 没有保存 Update
      // 也就是 workInProgress.updateQueue.firstBaseUpdate: null，null 没有 next，workInProgress.updateQueue.lastBaseUpdate 就也是 null
      // 那么直接将上面剪开环得到的单向链表的首 Update（firstPendingUpdate）赋值到 firstBaseUpdate
      
      firstBaseUpdate = firstPendingUpdate; // firstBaseUpdate: U1 → null 或 U1 → U2 → ... → Un → null
    } else {
      // workInProgress.updateQueue.lastBaseUpdate 不为 null
      // 说明 workInProgress.updateQueue 在上次 render 被打断或 commit 保存了最少一个 Update
      // 那么需要将上面剪开环得到的单向链表的首 Update（firstPendingUpdate）继续添加到已保存的 Update 链表的尾部
      
      lastBaseUpdate.next = firstPendingUpdate;
    }
    lastBaseUpdate = lastPendingUpdate; // lastPendingUpdate 在环被剪开前就已存放，所以
    // 如果 queue.shared.pending 中只有一个 Update，那么 lastPendingUpdate === firstPendingUpdate 都是U1，从而 firstBaseUpdate === lastBaseUpdate
    // 如果 queue.shared.pending 中只多一个 Update，那么 lastBaseUpdate 需要被赋值为 Un

    // If there's a current queue, and it's different from the base queue, then
    // we need to transfer the updates to that queue, too. Because the base
    // queue is a singly-linked list with no cycles, we can append to both
    // lists and take advantage of structural sharing.
    // TODO: Pass `current` as argument
    const current = workInProgress.alternate;
    if (current !== null) {
      // 如果 current 存在，则执行上面 workInProgress 同样的操作
      // 目的是为了防止 Update 丢失
      
      // This is always non-null on a ClassComponent or HostRoot
      const currentQueue: UpdateQueue<State> = (current.updateQueue: any);
      const currentLastBaseUpdate = currentQueue.lastBaseUpdate;
      if (currentLastBaseUpdate !== lastBaseUpdate) {
        if (currentLastBaseUpdate === null) {
          currentQueue.firstBaseUpdate = firstPendingUpdate;
        } else {
          currentLastBaseUpdate.next = firstPendingUpdate;
        }
        currentQueue.lastBaseUpdate = lastPendingUpdate;
      }
    }
  }

  // These values may change as we process the queue.
  if (firstBaseUpdate !== null) { // fiber 上是否存在 Update
    // Iterate through the list of updates to compute the result.
    let newState = queue.baseState; // 取 baseState
    // TODO: Don't need to accumulate this. Instead, we can remove renderLanes
    // from the original lanes.
    let newLanes = NoLanes;

    let newBaseState = null;
    let newFirstBaseUpdate = null;
    let newLastBaseUpdate = null;

    let update = firstBaseUpdate; // 中间变量，按照链表顺序遍历每个 Update
    do {
      const updateLane = update.lane;
      const updateEventTime = update.eventTime;

      // renderLanes 是否包含 updateLane
      // 也就是判断 updateLane 的优先级是否达到本次 render 的优先级
      if (!isSubsetOfLanes(renderLanes, updateLane)) {
        // 表示优先级不够

        // Priority is insufficient. Skip this update. If this is the first
        // skipped update, the previous update/state is the new base
        // update/state.

        // 克隆该 Update
        const clone: Update<State> = {
          eventTime: updateEventTime,
          lane: updateLane,

          tag: update.tag,
          payload: update.payload,
          callback: update.callback,

          next: null,
        };
        if (newLastBaseUpdate === null) {
          // 遍历到第一个优先级不够的 update 时
          
          newFirstBaseUpdate = newLastBaseUpdate = clone; // 克隆的 Update 同时赋值到首尾
          newBaseState = newState;
          // newState 是该 update 前面所有满足优先级的 update 累计执行 getStateFromUpdate 得到的 state
          // newBaseState 就做为下次更新时的 baseState
        } else {
          newLastBaseUpdate = newLastBaseUpdate.next = clone; // 克隆的 Update 添加到链表尾部
        }

        // 也就是优先级不够的 Update 都添加到 newBaseUpdate 做为下一次 render 的 pendig.shared

        // Update the remaining priority in the queue.
        newLanes = mergeLanes(newLanes, updateLane);
        // 假设 renderLanes 是 4，那么就是数值大于 4 的优先级不够
        // newLanes 初始值是 0
        // 假设第一个进到这个逻辑的 update.lane 是 8, mergeLanes（0 | 8） 后 newLanes 为 8
        // 假设第二个进到这个逻辑的 update.lane 也是 8, mergeLanes（8 | 8） 后 newLanes 还是 8
        // 假设第三个进到这个逻辑的 update.lane 是 16, mergeLanes（8 | 16） 后 newLanes 为 24
        // newLanes 的数值可能会越来越大，也就是下次更新的优先级要求会越来越低

      } else {
        // 表示优先级足够
        
        // This update does have sufficient priority.

        if (newLastBaseUpdate !== null) {
          // 遍历第一项的时候肯定进不来
          // 只有进到上面不满足优先级的判断后 newLastBaseUpdate 才会有值
          // 也就是将满足优先级的 Update 也进行克隆后添加到链表尾部
          
          const clone: Update<State> = {
            eventTime: updateEventTime,
            // This update is going to be committed so we never want uncommit
            // it. Using NoLane works because 0 is a subset of all bitmasks, so
            // this will never be skipped by the check above.
            lane: NoLane, // lane 会被赋值为 NoLane
            // NoLane 的值是 0，任何 renderLanes 都包括 0，这样就保证下次 render 不会被跳过

            tag: update.tag,
            payload: update.payload,
            callback: update.callback,

            next: null,
          };
          newLastBaseUpdate = newLastBaseUpdate.next = clone;
        }

        // 基于 Update 通过 newState 计算新的 state 赋值到 newState
        // 保证依赖连续性
        // Process this update.
        newState = getStateFromUpdate(
          workInProgress,
          queue,
          update,
          newState,
          props,
          instance,
        );
        const callback = update.callback;
        if (callback !== null) {
          // 如果 update.callback 有值（this.state的第二个参数回调函数，或ReactDOM.render的第三个参数回调函数）
          
          // 为 workInProgress 打上 Callback 标记
          workInProgress.flags |= Callback;

          // 将 update 添加到 workInProgress.updateQueue 的 effects 数组
          const effects = queue.effects;
          if (effects === null) {
            queue.effects = [update];
          } else {
            effects.push(update);
          }
        }
      }

      // 尝试遍历下个 update
      update = update.next;
      if (update === null) {
        // 下个 update 没有了，表示遍历应该结束了

        // 但是在结束前，需要再次检查 queue.shared.pending
        // 比如这种不规范的写法，在 this.setState 的回调中，再次调用 this.setState
        // 调用后 this.setState 会触发更新，产生的更新（Update）会添加到 queue.shared.pending 并进入该方法
        // 但是 payload 的类型是 function，会在 getStateFromUpdate 中执行
        // 执行的过程中又调用 this.setState，所以又会产生新的更新（Update）并添加到 queue.shared.pending
        // 所以需要再次检查
        // this.setState(state => {
        //   this.setState(state => {
        //     // ...
        //   })
        // 
        //   return {
        //     // ...
        //   }
        // })
        pendingQueue = queue.shared.pending;
        if (pendingQueue === null) {
          // 遍历结束
          
          break;
        } else {
          // queue.shared.pending 被添加了新的更新
          
          // An update was scheduled from inside a reducer. Add the new
          // pending updates to the end of the list and keep processing.
          const lastPendingUpdate = pendingQueue;
          // Intentionally unsound. Pending updates form a circular list, but we
          // unravel them when transferring them to the base queue.
          const firstPendingUpdate = ((lastPendingUpdate.next: any): Update<State>);
          lastPendingUpdate.next = null; // 就将环剪开
          update = firstPendingUpdate; // 继续遍历
          queue.lastBaseUpdate = lastPendingUpdate; // 修改 queue.lastBaseUpdate 的指向
          queue.shared.pending = null;
        }
      }
    } while (true);

    // 遍历结束后 newLastBaseUpdate 为 null 表示没有被跳过的 update
    // newBaseState 就是遍历的最后一项通过 getStateFromUpdate 得到的 state
    // 循环体中，!isSubsetOfLanes(renderLanes, updateLane) 的逻辑中
    // 有这样一行代码 newBaseState = newState
    // 要结合起来一起观察
    if (newLastBaseUpdate === null) {
      newBaseState = newState;
    }

    queue.baseState = ((newBaseState: any): State); // newBaseState 赋值到 queue.baseState
    queue.firstBaseUpdate = newFirstBaseUpdate; // 更新 fiber 在下次更新时要用到的 baseUpdate
    queue.lastBaseUpdate = newLastBaseUpdate;

    // Set the remaining expiration time to be whatever is remaining in the queue.
    // This should be fine because the only two other things that contribute to
    // expiration time are props and context. We're already in the middle of the
    // begin phase by the time we start processing the queue, so we've already
    // dealt with the props. Context in components that specify
    // shouldComponentUpdate is tricky; but we'll have to account for
    // that regardless.
    markSkippedUpdateLanes(newLanes);
    workInProgress.lanes = newLanes;
    workInProgress.memoizedState = newState;
    // 如果本次更新，所有的 update 优先级都足够，那么本次更新的 memoizedState 就等于下次更新的 baseState
    // 如果有 update 被跳过，那么 newBaseState 会在跳过这个 update 时赋值，而 newState 会在遍历后续项时
    // 通过 getStateFromUpdate 一直累加
  }

  if (__DEV__) {
    currentlyProcessingQueue = null;
  }
}

function callCallback(callback, context) {
  invariant(
    typeof callback === 'function',
    'Invalid argument passed as callback. Expected a function. Instead ' +
      'received: %s',
    callback,
  );
  callback.call(context);
}

export function resetHasForceUpdateBeforeProcessing() {
  hasForceUpdate = false;
}

export function checkHasForceUpdateAfterProcessing(): boolean {
  return hasForceUpdate;
}

export function commitUpdateQueue<State>(
  finishedWork: Fiber,
  finishedQueue: UpdateQueue<State>,
  instance: any,
): void {
  // Commit the effects
  const effects = finishedQueue.effects;
  finishedQueue.effects = null;
  if (effects !== null) {
    for (let i = 0; i < effects.length; i++) {
      const effect = effects[i];
      const callback = effect.callback;
      if (callback !== null) {
        effect.callback = null;
        callCallback(callback, instance);
      }
    }
  }
}

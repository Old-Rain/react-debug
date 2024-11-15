/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {FiberRoot, ReactPriorityLevel} from './ReactInternalTypes';

export opaque type LanePriority =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17;
export opaque type Lanes = number;
export opaque type Lane = number;
export opaque type LaneMap<T> = Array<T>;

import invariant from 'shared/invariant';

import {
  ImmediatePriority as ImmediateSchedulerPriority,
  UserBlockingPriority as UserBlockingSchedulerPriority,
  NormalPriority as NormalSchedulerPriority,
  LowPriority as LowSchedulerPriority,
  IdlePriority as IdleSchedulerPriority,
  NoPriority as NoSchedulerPriority,
} from './SchedulerWithReactIntegration.new';

export const SyncLanePriority: LanePriority = 15;
export const SyncBatchedLanePriority: LanePriority = 14;

const InputDiscreteHydrationLanePriority: LanePriority = 13;
export const InputDiscreteLanePriority: LanePriority = 12;

const InputContinuousHydrationLanePriority: LanePriority = 11;
export const InputContinuousLanePriority: LanePriority = 10;

const DefaultHydrationLanePriority: LanePriority = 9;
export const DefaultLanePriority: LanePriority = 8;

const TransitionHydrationPriority: LanePriority = 7;
export const TransitionPriority: LanePriority = 6;

const RetryLanePriority: LanePriority = 5;

const SelectiveHydrationLanePriority: LanePriority = 4;

const IdleHydrationLanePriority: LanePriority = 3;
const IdleLanePriority: LanePriority = 2;

const OffscreenLanePriority: LanePriority = 1;

export const NoLanePriority: LanePriority = 0;

// 总共 31 个 lane
const TotalLanes = 31;

// 越靠下，最左边的【1】离个位越远，优先级越低（达成第一个条件）

// 后缀为 lanes 的变量中包含多个 1，表示一批次的优先级，即相同的优先级
// 优先级越低的 lanes 占领的赛道越多，因为优先级越低，越容易被比自己优先级高的更新打断
// 导致优先级低的更新容易积压，所以需要更多的赛道来积压没有处理的【低优先级更新】
// 以此实现【批】的概念（达成第二个条件）

// 没有使用 lane
export const NoLanes: Lanes = /*                        */ 0b0000000000000000000000000000000;
export const NoLane: Lane = /*                          */ 0b0000000000000000000000000000000;

// 同步 lane
export const SyncLane: Lane = /*                        */ 0b0000000000000000000000000000001;
export const SyncBatchedLane: Lane = /*                 */ 0b0000000000000000000000000000010;

export const InputDiscreteHydrationLane: Lane = /*      */ 0b0000000000000000000000000000100;
const InputDiscreteLanes: Lanes = /*                    */ 0b0000000000000000000000000011000;

const InputContinuousHydrationLane: Lane = /*           */ 0b0000000000000000000000000100000;
const InputContinuousLanes: Lanes = /*                  */ 0b0000000000000000000000011000000;

export const DefaultHydrationLane: Lane = /*            */ 0b0000000000000000000000100000000;
export const DefaultLanes: Lanes = /*                   */ 0b0000000000000000000111000000000;

const TransitionHydrationLane: Lane = /*                */ 0b0000000000000000001000000000000;
const TransitionLanes: Lanes = /*                       */ 0b0000000001111111110000000000000;

const RetryLanes: Lanes = /*                            */ 0b0000011110000000000000000000000;

export const SomeRetryLane: Lanes = /*                  */ 0b0000010000000000000000000000000;

export const SelectiveHydrationLane: Lane = /*          */ 0b0000100000000000000000000000000;

const NonIdleLanes = /*                                 */ 0b0000111111111111111111111111111;

export const IdleHydrationLane: Lane = /*               */ 0b0001000000000000000000000000000;
const IdleLanes: Lanes = /*                             */ 0b0110000000000000000000000000000;

export const OffscreenLane: Lane = /*                   */ 0b1000000000000000000000000000000;

export const NoTimestamp = -1;

let currentUpdateLanePriority: LanePriority = NoLanePriority;

export function getCurrentUpdateLanePriority(): LanePriority {
  return currentUpdateLanePriority;
}

export function setCurrentUpdateLanePriority(newLanePriority: LanePriority) {
  currentUpdateLanePriority = newLanePriority;
}

// "Registers" used to "return" multiple values
// Used by getHighestPriorityLanes and getNextLanes:
let return_highestLanePriority: LanePriority = DefaultLanePriority;

/** 获取 lanes 中优先级最高的 lane 和优先级 */
function getHighestPriorityLanes(lanes: Lanes | Lane): Lanes {
  // 同步 lane
  if ((SyncLane & lanes) !== NoLanes) {
    return_highestLanePriority = SyncLanePriority;
    return SyncLane;
  }
  if ((SyncBatchedLane & lanes) !== NoLanes) {
    return_highestLanePriority = SyncBatchedLanePriority;
    return SyncBatchedLane;
  }
  if ((InputDiscreteHydrationLane & lanes) !== NoLanes) {
    return_highestLanePriority = InputDiscreteHydrationLanePriority;
    return InputDiscreteHydrationLane;
  }
  const inputDiscreteLanes = InputDiscreteLanes & lanes;
  if (inputDiscreteLanes !== NoLanes) {
    return_highestLanePriority = InputDiscreteLanePriority;
    return inputDiscreteLanes;
  }
  if ((lanes & InputContinuousHydrationLane) !== NoLanes) {
    return_highestLanePriority = InputContinuousHydrationLanePriority;
    return InputContinuousHydrationLane;
  }
  const inputContinuousLanes = InputContinuousLanes & lanes;
  if (inputContinuousLanes !== NoLanes) {
    return_highestLanePriority = InputContinuousLanePriority;
    return inputContinuousLanes;
  }
  if ((lanes & DefaultHydrationLane) !== NoLanes) {
    return_highestLanePriority = DefaultHydrationLanePriority;
    return DefaultHydrationLane;
  }

  // lanes 来源不明，可能是多次合并的 lanes，所以与定义的各 lanes 取交集，再判断
  const defaultLanes = DefaultLanes & lanes;
  if (defaultLanes !== NoLanes) {
    return_highestLanePriority = DefaultLanePriority; // 优先级保存到全局
    return defaultLanes;
  }
  if ((lanes & TransitionHydrationLane) !== NoLanes) {
    return_highestLanePriority = TransitionHydrationPriority;
    return TransitionHydrationLane;
  }
  const transitionLanes = TransitionLanes & lanes;
  if (transitionLanes !== NoLanes) {
    return_highestLanePriority = TransitionPriority;
    return transitionLanes;
  }
  const retryLanes = RetryLanes & lanes;
  if (retryLanes !== NoLanes) {
    return_highestLanePriority = RetryLanePriority;
    return retryLanes;
  }
  if (lanes & SelectiveHydrationLane) {
    return_highestLanePriority = SelectiveHydrationLanePriority;
    return SelectiveHydrationLane;
  }
  if ((lanes & IdleHydrationLane) !== NoLanes) {
    return_highestLanePriority = IdleHydrationLanePriority;
    return IdleHydrationLane;
  }
  const idleLanes = IdleLanes & lanes;
  if (idleLanes !== NoLanes) {
    return_highestLanePriority = IdleLanePriority;
    return idleLanes;
  }
  if ((OffscreenLane & lanes) !== NoLanes) {
    return_highestLanePriority = OffscreenLanePriority;
    return OffscreenLane;
  }
  if (__DEV__) {
    console.error('Should have found matching lanes. This is a bug in React.');
  }
  // This shouldn't be reachable, but as a fallback, return the entire bitmask.
  return_highestLanePriority = DefaultLanePriority;
  return lanes;
}

export function schedulerPriorityToLanePriority(
  schedulerPriorityLevel: ReactPriorityLevel,
): LanePriority {
  switch (schedulerPriorityLevel) {
    case ImmediateSchedulerPriority: // 99
      return SyncLanePriority; // 15

    case UserBlockingSchedulerPriority: // 98
      return InputContinuousLanePriority; // 10

    case NormalSchedulerPriority: // 97
    case LowSchedulerPriority: // 96
      // TODO: Handle LowSchedulerPriority, somehow. Maybe the same lane as hydration.
      return DefaultLanePriority; // 8

    case IdleSchedulerPriority: // 95
      return IdleLanePriority; // 2

    default:
      return NoLanePriority; // 0
  }
}

export function lanePriorityToSchedulerPriority(
  lanePriority: LanePriority,
): ReactPriorityLevel {
  switch (lanePriority) {
    case SyncLanePriority:
    case SyncBatchedLanePriority:
      return ImmediateSchedulerPriority;
    case InputDiscreteHydrationLanePriority:
    case InputDiscreteLanePriority:
    case InputContinuousHydrationLanePriority:
    case InputContinuousLanePriority:
      return UserBlockingSchedulerPriority;
    case DefaultHydrationLanePriority:
    case DefaultLanePriority:
    case TransitionHydrationPriority:
    case TransitionPriority:
    case SelectiveHydrationLanePriority:
    case RetryLanePriority:
      return NormalSchedulerPriority;
    case IdleHydrationLanePriority:
    case IdleLanePriority:
    case OffscreenLanePriority:
      return IdleSchedulerPriority;
    case NoLanePriority:
      return NoSchedulerPriority;
    default:
      invariant(
        false,
        'Invalid update priority: %s. This is a bug in React.',
        lanePriority,
      );
  }
}

export function getNextLanes(root: FiberRoot, wipLanes: Lanes): Lanes {
  // Early bailout if there's no pending work left.
  const pendingLanes = root.pendingLanes;

  // pendingLanes 中没有 lane
  // 表示没有更新，还原到初始值
  if (pendingLanes === NoLanes) {
    return_highestLanePriority = NoLanePriority;
    return NoLanes;
  }

  // 声明 lane 及优先级
  let nextLanes = NoLanes;
  let nextLanePriority = NoLanePriority;

  const expiredLanes = root.expiredLanes;
  const suspendedLanes = root.suspendedLanes;
  const pingedLanes = root.pingedLanes;

  // Check if any work has expired.
  // 先检查是否有过期的 lane，有则转成同步的任务，以此解决低优先级任务被打断而过期的饥饿问题
  if (expiredLanes !== NoLanes) {
    nextLanes = expiredLanes;
    nextLanePriority = return_highestLanePriority = SyncLanePriority;
  } else {
    // Do not work on any idle work until all the non-idle work has finished,
    // even if the work is suspended.
    const nonIdlePendingLanes = pendingLanes & NonIdleLanes; // 取非空闲的 lanes

    if (nonIdlePendingLanes !== NoLanes) {
      // 如果存在 NonIdleLanes 中的 lane
      
      const nonIdleUnblockedLanes = nonIdlePendingLanes & ~suspendedLanes; // 去除 Suspense 相关的 lanes

      if (nonIdleUnblockedLanes !== NoLanes) {
        // 去除 Suspense 相关的 lanes 后，是否还有 lane
        
        nextLanes = getHighestPriorityLanes(nonIdleUnblockedLanes); // 然后再从这些 lanes 中取到优先级最高的 lane
        nextLanePriority = return_highestLanePriority; // return_highestLanePriority 在 getHighestPriorityLanes() 中已经被赋值
      } else {
        // 去除 Suspense 相关的 lanes 后，没有 lane
        // 再看是否有 Suspense 相关的 lanes
        
        const nonIdlePingedLanes = nonIdlePendingLanes & pingedLanes;
        if (nonIdlePingedLanes !== NoLanes) {
          nextLanes = getHighestPriorityLanes(nonIdlePingedLanes);
          nextLanePriority = return_highestLanePriority;
        }
      }
    } else {
      // 比 NonIdleLanes 优先级还要低的 lanes
      
      // The only remaining work is Idle.
      const unblockedLanes = pendingLanes & ~suspendedLanes;
      if (unblockedLanes !== NoLanes) {
        nextLanes = getHighestPriorityLanes(unblockedLanes);
        nextLanePriority = return_highestLanePriority;
      } else {
        if (pingedLanes !== NoLanes) {
          nextLanes = getHighestPriorityLanes(pingedLanes);
          nextLanePriority = return_highestLanePriority;
        }
      }
    }
  }

  // 没有需要使用的 lanes，即没有更新需要执行
  if (nextLanes === NoLanes) {
    // This should only be reachable if we're suspended
    // TODO: Consider warning in this path if a fallback timer is not scheduled.
    return NoLanes;
  }

  // If there are higher priority lanes, we'll include them even if they
  // are suspended.
  // 获取与 nextLanes 相等或更高优先级的 lanes
  // 再与 pendingLanes 取交集做为最终的 nextLanes
  nextLanes = pendingLanes & getEqualOrHigherPriorityLanes(nextLanes);

  // If we're already in the middle of a render, switching lanes will interrupt
  // it and we'll lose our progress. We should only do this if the new lanes are
  // higher priority.
  // Suspense 相关
  // 首屏 wipLanes 就是 NoLanes
  if (
    wipLanes !== NoLanes &&
    wipLanes !== nextLanes &&
    // If we already suspended with a delay, then interrupting is fine. Don't
    // bother waiting until the root is complete.
    (wipLanes & suspendedLanes) === NoLanes
  ) {
    getHighestPriorityLanes(wipLanes);
    const wipLanePriority = return_highestLanePriority;
    if (nextLanePriority <= wipLanePriority) {
      return wipLanes;
    } else {
      return_highestLanePriority = nextLanePriority;
    }
  }

  // Check for entangled lanes and add them to the batch.
  //
  // A lane is said to be entangled with another when it's not allowed to render
  // in a batch that does not also include the other lane. Typically we do this
  // when multiple updates have the same source, and we only want to respond to
  // the most recent event from that source.
  //
  // Note that we apply entanglements *after* checking for partial work above.
  // This means that if a lane is entangled during an interleaved event while
  // it's already rendering, we won't interrupt it. This is intentional, since
  // entanglement is usually "best effort": we'll try our best to render the
  // lanes in the same batch, but it's not worth throwing out partially
  // completed work in order to do it.
  //
  // For those exceptions where entanglement is semantically important, like
  // useMutableSource, we should ensure that there is no partial work at the
  // time we apply the entanglement.
  // useMutableSource 相关
  const entangledLanes = root.entangledLanes;
  if (entangledLanes !== NoLanes) {
    const entanglements = root.entanglements;
    let lanes = nextLanes & entangledLanes;
    while (lanes > 0) {
      const index = pickArbitraryLaneIndex(lanes);
      const lane = 1 << index;

      nextLanes |= entanglements[index];

      lanes &= ~lane;
    }
  }

  return nextLanes;
}

export function getMostRecentEventTime(root: FiberRoot, lanes: Lanes): number {
  const eventTimes = root.eventTimes;

  let mostRecentEventTime = NoTimestamp;
  while (lanes > 0) {
    const index = pickArbitraryLaneIndex(lanes);
    const lane = 1 << index;

    const eventTime = eventTimes[index];
    if (eventTime > mostRecentEventTime) {
      mostRecentEventTime = eventTime;
    }

    lanes &= ~lane;
  }

  return mostRecentEventTime;
}

/**
 * 根据 lane 的优先级，计算过期时间戳
 * 优先级越低，过期时间戳值越大
 */
function computeExpirationTime(lane: Lane, currentTime: number) {
  // TODO: Expiration heuristic is constant per lane, so could use a map.
  getHighestPriorityLanes(lane); // 获取 lane 的优先级
  const priority = return_highestLanePriority;

  // currentTime 即 lane 的开始时间戳，加上不同的值，做为过期时间戳

  if (priority >= InputContinuousLanePriority) { // InputContinuousLanePriority 10
    // User interactions should expire slightly more quickly.
    //
    // NOTE: This is set to the corresponding constant as in Scheduler.js. When
    // we made it larger, a product metric in www regressed, suggesting there's
    // a user interaction that's being starved by a series of synchronous
    // updates. If that theory is correct, the proper solution is to fix the
    // starvation. However, this scenario supports the idea that expiration
    // times are an important safeguard when starvation does happen.
    //
    // Also note that, in the case of user input specifically, this will soon no
    // longer be an issue because we plan to make user input synchronous by
    // default (until you enter `startTransition`, of course.)
    //
    // If weren't planning to make these updates synchronous soon anyway, I
    // would probably make this number a configurable parameter.
    return currentTime + 250;
  } else if (priority >= TransitionPriority) { // TransitionPriority 6
    return currentTime + 5000;
  } else {
    // Anything idle priority or lower should never expire.
    return NoTimestamp;
  }
}

/**
 * 遍历 pendingLanes 中所有的 lane
 * 为没有过期时间戳的 lane 计算过期时间
 * 已经过期的 lane 合并到 root.expiredLanes，expiredLanes 即包含所有已经过期的 lane
 */
export function markStarvedLanesAsExpired(
  root: FiberRoot,
  currentTime: number,
): void {
  // TODO: This gets called every time we yield. We can optimize by storing
  // the earliest expiration time on the root. Then use that to quickly bail out
  // of this function.

  const pendingLanes = root.pendingLanes;
  const suspendedLanes = root.suspendedLanes;
  const pingedLanes = root.pingedLanes;
  const expirationTimes = root.expirationTimes;
  // expirationTimes 中保存了 31 个 lane 的过期时间戳
  // 初始值 NoTimestamp -1 [-1, -1, -1, ...]，表示没有使用

  // Iterate through the pending lanes and check if we've reached their
  // expiration time. If so, we'll assume the update is being starved and mark
  // it as expired to force it to finish.
  let lanes = pendingLanes;
  while (lanes > 0) {
    const index = pickArbitraryLaneIndex(lanes); // 得到 lanes 中最左边 lane 的下标
    const lane = 1 << index; // 得到 lanes 中最左边的 lane
    // 即从左向右遍历 pendingLanes 中的 lane

    const expirationTime = expirationTimes[index];
    if (expirationTime === NoTimestamp) {
      // 如果 lane 没有时间戳

      // Found a pending lane with no expiration time. If it's not suspended, or
      // if it's pinged, assume it's CPU-bound. Compute a new expiration time
      // using the current time.
      if (
        (lane & suspendedLanes) === NoLanes ||
        (lane & pingedLanes) !== NoLanes // 无视
      ) {
        // suspendedLanes 和 pingedLanes 都是跟 Suspense 相关
        // 如果 lane 跟 Suspense 无关，那么重新计算一个过期时间
        
        // Assumes timestamps are monotonically increasing.
        expirationTimes[index] = computeExpirationTime(lane, currentTime);
      }
    } else if (expirationTime <= currentTime) {
      // 如果 lane 有时间戳，并且小于 currentTime，说明已经过期
      // 需要将 lane 合并到 expiredLanes 中
      
      // This lane expired
      root.expiredLanes |= lane;
    }

    lanes &= ~lane; // 最后将该 lane 从临时 lanes 中移除，尝试遍历下一个 lane
  }

  // 总结
  // 遍历 pendingLanes 中所有的 lane
  // 为没有过期时间戳的 lane 计算过期时间
  // 已经过期的 lane 合并到 root.expiredLanes，expiredLanes 即包含所有已经过期的 lane
}

// This returns the highest priority pending lanes regardless of whether they
// are suspended.
export function getHighestPriorityPendingLanes(root: FiberRoot) {
  return getHighestPriorityLanes(root.pendingLanes);
}

export function getLanesToRetrySynchronouslyOnError(root: FiberRoot): Lanes {
  const everythingButOffscreen = root.pendingLanes & ~OffscreenLane;
  if (everythingButOffscreen !== NoLanes) {
    return everythingButOffscreen;
  }
  if (everythingButOffscreen & OffscreenLane) {
    return OffscreenLane;
  }
  return NoLanes;
}

export function returnNextLanesPriority() {
  return return_highestLanePriority;
}
export function includesNonIdleWork(lanes: Lanes) {
  return (lanes & NonIdleLanes) !== NoLanes;
}
export function includesOnlyRetries(lanes: Lanes) {
  return (lanes & RetryLanes) === lanes;
}
export function includesOnlyTransitions(lanes: Lanes) {
  return (lanes & TransitionLanes) === lanes;
}

// To ensure consistency across multiple updates in the same event, this should
// be a pure function, so that it always returns the same lane for given inputs.
export function findUpdateLane(
  lanePriority: LanePriority, // 8
  wipLanes: Lanes, // 0
): Lane {
  switch (lanePriority) {
    case NoLanePriority:
      break;
    case SyncLanePriority:
      return SyncLane;
    case SyncBatchedLanePriority:
      return SyncBatchedLane;
    case InputDiscreteLanePriority: {
      const lane = pickArbitraryLane(InputDiscreteLanes & ~wipLanes);
      if (lane === NoLane) {
        // Shift to the next priority level
        return findUpdateLane(InputContinuousLanePriority, wipLanes);
      }
      return lane;
    }
    case InputContinuousLanePriority: {
      const lane = pickArbitraryLane(InputContinuousLanes & ~wipLanes);
      if (lane === NoLane) {
        // Shift to the next priority level
        return findUpdateLane(DefaultLanePriority, wipLanes);
      }
      return lane;
    }
    case DefaultLanePriority: { // 8
      // DefaultLanes（0b0111000000000）中包含三个 1，理论上就有三个可用的 lane

      // 排除 Work in progress 工作中的 lane 后，选则最靠右的 lane
      // 如果没有可用的 lane，那么优先级降低至 TransitionLanes，排除 wipLanes 后再次尝试获取
      // TransitionLanes（0b1111111110000000000000）包含 9 个 lane，找到可用 lane 的可能性会更高

      // 如果还取不到，就从不排除 wipLanes 的 DefaultLanes 中取最右的 lane 也就是 512
      // DefaultLanes 中的 lane 都被占用了，强行取一个使用中的 lane，可能会打断一个正在进行中的更新

      // 首屏取到 512
      let lane = pickArbitraryLane(DefaultLanes & ~wipLanes);
      if (lane === NoLane) {
        // If all the default lanes are already being worked on, look for a
        // lane in the transition range.
        lane = pickArbitraryLane(TransitionLanes & ~wipLanes);
        if (lane === NoLane) {
          // All the transition lanes are taken, too. This should be very
          // rare, but as a last resort, pick a default lane. This will have
          // the effect of interrupting the current work-in-progress render.
          lane = pickArbitraryLane(DefaultLanes);
        }
      }
      return lane;
    }
    case TransitionPriority: // Should be handled by findTransitionLane instead
    case RetryLanePriority: // Should be handled by findRetryLane instead
      break;
    case IdleLanePriority:
      let lane = pickArbitraryLane(IdleLanes & ~wipLanes);
      if (lane === NoLane) {
        lane = pickArbitraryLane(IdleLanes);
      }
      return lane;
    default:
      // The remaining priorities are not valid for updates
      break;
  }
  invariant(
    false,
    'Invalid update priority: %s. This is a bug in React.',
    lanePriority,
  );
}

// To ensure consistency across multiple updates in the same event, this should
// be pure function, so that it always returns the same lane for given inputs.
export function findTransitionLane(wipLanes: Lanes, pendingLanes: Lanes): Lane {
  // First look for lanes that are completely unclaimed, i.e. have no
  // pending work.
  let lane = pickArbitraryLane(TransitionLanes & ~pendingLanes);
  if (lane === NoLane) {
    // If all lanes have pending work, look for a lane that isn't currently
    // being worked on.
    lane = pickArbitraryLane(TransitionLanes & ~wipLanes);
    if (lane === NoLane) {
      // If everything is being worked on, pick any lane. This has the
      // effect of interrupting the current work-in-progress.
      lane = pickArbitraryLane(TransitionLanes);
    }
  }
  return lane;
}

// To ensure consistency across multiple updates in the same event, this should
// be pure function, so that it always returns the same lane for given inputs.
export function findRetryLane(wipLanes: Lanes): Lane {
  // This is a fork of `findUpdateLane` designed specifically for Suspense
  // "retries" — a special update that attempts to flip a Suspense boundary
  // from its placeholder state to its primary/resolved state.
  let lane = pickArbitraryLane(RetryLanes & ~wipLanes);
  if (lane === NoLane) {
    lane = pickArbitraryLane(RetryLanes);
  }
  return lane;
}

/** 获取 lanes 中优先级最高的 lane，即最右边的lane */
function getHighestPriorityLane(lanes: Lanes) {
  return lanes & -lanes;
  // 负数二进制表示法为 1 0 反转再 + 1
  
  // 传入 DefaultLanes（0b111000000000）
  // -DefaultLanes 即 0b000111111111 + 1 得到 0b001000000000
  // 0b111000000000
  // &
  // 0b001000000000
  // =
  // 0b001000000000 512

  // 传入【移除 512 后的 DefaultLanes】（0b110000000000）
  // 0b110000000000
  // &
  // 0b010000000000
  // =
  // 0b010000000000 1024

  // 优先顺序从右往左
}

/** 获取 lanes 中优先级最低的 lane，即最左边的lane */
function getLowestPriorityLane(lanes: Lanes): Lane {
  // This finds the most significant non-zero bit.
  const index = 31 - clz32(lanes);
  return index < 0 ? NoLanes : 1 << index;
}

/** 
 * 获取相等或更高优先级的 lanes
 * 从【传入 lanes】中找最左边的 1（即优先级最低的 lane）
 * 再将这个 1 右边的数，全部改成 1
 * 就可以得到和【传入 lanes 】【相等或优先级更高】的所有 lane
 */
function getEqualOrHigherPriorityLanes(lanes: Lanes | Lane): Lanes {
  return (getLowestPriorityLane(lanes) << 1) - 1;
  // lanes 0b0101 5
  // getLowestPriorityLane(5) 得到 4 0b0100
  // 左移一位 得到 0b1000 8
  // 8 - 1 得到 7 0b0111
}

/** 从传入的 lanes 中取最靠右的 lane */
export function pickArbitraryLane(lanes: Lanes): Lane {
  // This wrapper function gets inlined. Only exists so to communicate that it
  // doesn't matter which bit is selected; you can pick any bit without
  // affecting the algorithms where its used. Here I'm using
  // getHighestPriorityLane because it requires the fewest operations.
  return getHighestPriorityLane(lanes);
}

/** 
 * 获取 lane 最左边的数字，从右往左的 index
 * 
 * clz32(0b100) 为 29，即补满 32 位，前面有 29 个0
 * 31 - 29 = 2，即 1 在从右往左下标 2 的位置
 * 
 * clz32(0b111) 也是 29
 * 所以是入参最左边的 1 从右往左的下标
 */
function pickArbitraryLaneIndex(lanes: Lanes) {
  return 31 - clz32(lanes);
}

/** 
 * 取 lane 从右到左的下标
 * laneToIndex(0b01) 得到0
 * laneToIndex(0b10) 得到1
 */
function laneToIndex(lane: Lane) {
  return pickArbitraryLaneIndex(lane);
}

/** 
 * a 是否包含部分 b
 * 判断是否有交集
 */
export function includesSomeLane(a: Lanes | Lane, b: Lanes | Lane) {
  return (a & b) !== NoLanes;
}

/** 
 * subset 是否为 set 子集
 * 判断【set 和 subset 的交集】是否全等于 subset
 */
export function isSubsetOfLanes(set: Lanes, subset: Lanes | Lane) {
  return (set & subset) === subset;
}

/** 
 * 合并 lane
 * 按位或运算：0b01 | 0b10 得到 0b11
 */
export function mergeLanes(a: Lanes | Lane, b: Lanes | Lane): Lanes {
  return a | b;
}

/** 
 * 从 set 中移除 subset
 * 对 subset 进行按位非操作，然后与 set 取交集：0b11 & ~0b01 得到 0b10
 */
export function removeLanes(set: Lanes, subset: Lanes | Lane): Lanes {
  return set & ~subset;
}

// Seems redundant, but it changes the type from a single lane (used for
// updates) to a group of lanes (used for flushing work).
export function laneToLanes(lane: Lane): Lanes {
  return lane;
}

export function higherPriorityLane(a: Lane, b: Lane) {
  // This works because the bit ranges decrease in priority as you go left.
  return a !== NoLane && a < b ? a : b;
}

export function higherLanePriority(
  a: LanePriority,
  b: LanePriority,
): LanePriority {
  return a !== NoLanePriority && a > b ? a : b;
}

export function createLaneMap<T>(initial: T): LaneMap<T> {
  return new Array(TotalLanes).fill(initial);
}

export function markRootUpdated(
  root: FiberRoot,
  updateLane: Lane,
  eventTime: number,
) {
  root.pendingLanes |= updateLane; // pendingLanes：需要进行但是还没有进行的 lanes

  // TODO: Theoretically, any update to any lane can unblock any other lane. But
  // it's not practical to try every single possible combination. We need a
  // heuristic to decide which lanes to attempt to render, and in which batches.
  // For now, we use the same heuristic as in the old ExpirationTimes model:
  // retry any lane at equal or lower priority, but don't try updates at higher
  // priority without also including the lower priority updates. This works well
  // when considering updates across different priority levels, but isn't
  // sufficient for updates within the same priority, since we want to treat
  // those updates as parallel.

  // Unsuspend any update at equal or lower priority.
  const higherPriorityLanes = updateLane - 1; // Turns 0b1000 into 0b0111

  root.suspendedLanes &= higherPriorityLanes;
  root.pingedLanes &= higherPriorityLanes;

  // root.eventTimes 是一个数组，记录 31 个 lane 的开始时间
  // 初始值为 0， [0, 0, 0, ...]
  // 首屏的 eventTime 在 updateContainer 的最开始，调用 requestEventTime() 获取
  const eventTimes = root.eventTimes;
  const index = laneToIndex(updateLane); // 找到 lane 的下标
  // We can always overwrite an existing timestamp because we prefer the most
  // recent event, and we assume time is monotonically increasing.
  eventTimes[index] = eventTime; // 保存传入的 updateLane 的开始时间
}

export function markRootSuspended(root: FiberRoot, suspendedLanes: Lanes) {
  root.suspendedLanes |= suspendedLanes;
  root.pingedLanes &= ~suspendedLanes;

  // The suspended lanes are no longer CPU-bound. Clear their expiration times.
  const expirationTimes = root.expirationTimes;
  let lanes = suspendedLanes;
  while (lanes > 0) {
    const index = pickArbitraryLaneIndex(lanes);
    const lane = 1 << index;

    expirationTimes[index] = NoTimestamp;

    lanes &= ~lane;
  }
}

export function markRootPinged(
  root: FiberRoot,
  pingedLanes: Lanes,
  eventTime: number,
) {
  root.pingedLanes |= root.suspendedLanes & pingedLanes;
}

export function markRootExpired(root: FiberRoot, expiredLanes: Lanes) {
  root.expiredLanes |= expiredLanes & root.pendingLanes;
}

export function markDiscreteUpdatesExpired(root: FiberRoot) {
  root.expiredLanes |= InputDiscreteLanes & root.pendingLanes;
}

export function hasDiscreteLanes(lanes: Lanes) {
  return (lanes & InputDiscreteLanes) !== NoLanes;
}

export function markRootMutableRead(root: FiberRoot, updateLane: Lane) {
  root.mutableReadLanes |= updateLane & root.pendingLanes;
}

export function markRootFinished(root: FiberRoot, remainingLanes: Lanes) {
  const noLongerPendingLanes = root.pendingLanes & ~remainingLanes;
  // 本次更新所有用到的 lanes 都保存在 root.pendingLanes
  // 剔除还需要使用的 remainingLanes，得到 noLongerPendingLanes，即不再使用的 lanes

  root.pendingLanes = remainingLanes; // 还需要使用的 lanes，再来一次

  // Let's try everything again
  // Suspense 相关
  root.suspendedLanes = 0;
  root.pingedLanes = 0;

  // 过期的 lanes
  root.expiredLanes &= remainingLanes;

  // useMutableSource 相关
  root.mutableReadLanes &= remainingLanes;
  root.entangledLanes &= remainingLanes;

  const entanglements = root.entanglements;
  const eventTimes = root.eventTimes;
  const expirationTimes = root.expirationTimes;

  // Clear the lanes that no longer have pending work
  let lanes = noLongerPendingLanes;
  while (lanes > 0) {
    const index = pickArbitraryLaneIndex(lanes);
    const lane = 1 << index;

    // 遍历不再使用的 lanes，重置过期时间等属性
    entanglements[index] = NoLanes;
    eventTimes[index] = NoTimestamp;
    expirationTimes[index] = NoTimestamp;

    lanes &= ~lane;
  }
}

export function markRootEntangled(root: FiberRoot, entangledLanes: Lanes) {
  root.entangledLanes |= entangledLanes;

  const entanglements = root.entanglements;
  let lanes = entangledLanes;
  while (lanes > 0) {
    const index = pickArbitraryLaneIndex(lanes);
    const lane = 1 << index;

    entanglements[index] |= entangledLanes;

    lanes &= ~lane;
  }
}

export function getBumpedLaneForHydration(
  root: FiberRoot,
  renderLanes: Lanes,
): Lane {
  getHighestPriorityLanes(renderLanes);
  const highestLanePriority = return_highestLanePriority;

  let lane;
  switch (highestLanePriority) {
    case SyncLanePriority:
    case SyncBatchedLanePriority:
      lane = NoLane;
      break;
    case InputDiscreteHydrationLanePriority:
    case InputDiscreteLanePriority:
      lane = InputDiscreteHydrationLane;
      break;
    case InputContinuousHydrationLanePriority:
    case InputContinuousLanePriority:
      lane = InputContinuousHydrationLane;
      break;
    case DefaultHydrationLanePriority:
    case DefaultLanePriority:
      lane = DefaultHydrationLane;
      break;
    case TransitionHydrationPriority:
    case TransitionPriority:
      lane = TransitionHydrationLane;
      break;
    case RetryLanePriority:
      // Shouldn't be reachable under normal circumstances, so there's no
      // dedicated lane for retry priority. Use the one for long transitions.
      lane = TransitionHydrationLane;
      break;
    case SelectiveHydrationLanePriority:
      lane = SelectiveHydrationLane;
      break;
    case IdleHydrationLanePriority:
    case IdleLanePriority:
      lane = IdleHydrationLane;
      break;
    case OffscreenLanePriority:
    case NoLanePriority:
      lane = NoLane;
      break;
    default:
      invariant(false, 'Invalid lane: %s. This is a bug in React.', lane);
  }

  // Check if the lane we chose is suspended. If so, that indicates that we
  // already attempted and failed to hydrate at that level. Also check if we're
  // already rendering that lane, which is rare but could happen.
  if ((lane & (root.suspendedLanes | renderLanes)) !== NoLane) {
    // Give up trying to hydrate and fall back to client render.
    return NoLane;
  }

  return lane;
}

const clz32 = Math.clz32 ? Math.clz32 : clz32Fallback;

// Count leading zeros. Only used on lanes, so assume input is an integer.
// Based on:
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/clz32
const log = Math.log;
const LN2 = Math.LN2;
function clz32Fallback(lanes: Lanes | Lane) {
  if (lanes === 0) {
    return 32;
  }
  return (31 - ((log(lanes) / LN2) | 0)) | 0;
}

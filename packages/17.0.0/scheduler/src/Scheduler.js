/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/* eslint-disable no-var */

import {
  enableSchedulerDebugging,
  enableProfiling,
} from './SchedulerFeatureFlags';
import {
  requestHostCallback,
  requestHostTimeout,
  cancelHostTimeout,
  shouldYieldToHost,
  getCurrentTime,
  forceFrameRate,
  requestPaint,
} from './SchedulerHostConfig';
import {push, pop, peek} from './SchedulerMinHeap';

// TODO: Use symbols?
import {
  ImmediatePriority,
  UserBlockingPriority,
  NormalPriority,
  LowPriority,
  IdlePriority,
} from './SchedulerPriorities';
import {
  sharedProfilingBuffer,
  markTaskRun,
  markTaskYield,
  markTaskCompleted,
  markTaskCanceled,
  markTaskErrored,
  markSchedulerSuspended,
  markSchedulerUnsuspended,
  markTaskStart,
  stopLoggingProfilingEvents,
  startLoggingProfilingEvents,
} from './SchedulerProfiling';

// Max 31 bit integer. The max integer size in V8 for 32-bit systems.
// Math.pow(2, 30) - 1
// 0b111111111111111111111111111111
var maxSigned31BitInt = 1073741823;

// Times out immediately
var IMMEDIATE_PRIORITY_TIMEOUT = -1;
// Eventually times out
var USER_BLOCKING_PRIORITY_TIMEOUT = 250;
var NORMAL_PRIORITY_TIMEOUT = 5000;
var LOW_PRIORITY_TIMEOUT = 10000;
// Never times out
var IDLE_PRIORITY_TIMEOUT = maxSigned31BitInt;

// Tasks are stored on a min heap
var taskQueue = [];
var timerQueue = [];

// Incrementing id counter. Used to maintain insertion order.
var taskIdCounter = 1;

// Pausing the scheduler is useful for debugging.
var isSchedulerPaused = false;

var currentTask = null;
var currentPriorityLevel = NormalPriority; // 3

// This is set while performing work, to prevent re-entrancy.
var isPerformingWork = false;

var isHostCallbackScheduled = false;
var isHostTimeoutScheduled = false;

/** 将 timerQueue 中到期的任务添加至 taskQueue */
function advanceTimers(currentTime) {
  // Check for tasks that are no longer delayed and add them to the queue.
  let timer = peek(timerQueue); // 取 timerQueue 中的第一个任务
  while (timer !== null) {
    if (timer.callback === null) {
      // 任务的 callback 不存在直接删除
      
      // Timer was cancelled.
      pop(timerQueue);
    } else if (timer.startTime <= currentTime) {
      // 任务开始时间小于当前时间，表示任务需要安排调度
      // 将任务的排序编号 sortIndex 由 startTime 改为 expirationTime
      // 从 timerQueue 中删除，并添加到 taskQueue
      
      // Timer fired. Transfer to the task queue.
      pop(timerQueue);
      timer.sortIndex = timer.expirationTime;
      push(taskQueue, timer);
      if (enableProfiling) {
        markTaskStart(timer, currentTime);
        timer.isQueued = true;
      }
    } else {
      // timerQueue 堆顶的任务尚未过期
      // 那么其后续任务更加不会过期，所以终止循环

      // Remaining timers are pending.
      return;
    }
    
    timer = peek(timerQueue);
  }
}

function handleTimeout(currentTime) {
  isHostTimeoutScheduled = false; // 定时调度触发后，重置定时器状态为false
  advanceTimers(currentTime); // 将 timerQueue 中到期的任务添加至 taskQueue

  // 先决条件为 HostCallbackScheduled 处于未调度的状态
  if (!isHostCallbackScheduled) {
    if (peek(taskQueue) !== null) {
      // 如果 taskQueue 堆顶有任务
      
      isHostCallbackScheduled = true; // 表示正在调度
      requestHostCallback(flushWork);
    } else {
      // taskQueue 堆顶没有任务，表示浏览器处于空闲状态
      // 则取 timerQueue 堆顶，请求定时调度
      // 直到 taskQueue 和 timerQueue 都清空，结束循环
      
      const firstTimer = peek(timerQueue);
      if (firstTimer !== null) {
        requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
      }
    }
  }
}

// 执行 requestHostCallback 时传入的回调
// 也就是会保存在时间切片模块的 scheduledHostCallback 变量上
function flushWork(hasTimeRemaining, initialTime) {
  if (enableProfiling) {
    markSchedulerUnsuspended(initialTime);
  }

  // We'll need a host callback the next time work is scheduled.
  isHostCallbackScheduled = false; // 重置 HostCallbackScheduled

  // 如果请求过定时调度，则需要取消
  if (isHostTimeoutScheduled) {
    // We scheduled a timeout but it's no longer needed. Cancel it.
    isHostTimeoutScheduled = false;
    cancelHostTimeout();
  }

  isPerformingWork = true; // 将 PerformingWork 切换至工作状态
  const previousPriorityLevel = currentPriorityLevel; // 记录当前全局优先级
  try {
    if (enableProfiling) {
      try {
        return workLoop(hasTimeRemaining, initialTime);
      } catch (error) {
        if (currentTask !== null) {
          const currentTime = getCurrentTime();
          markTaskErrored(currentTask, currentTime);
          currentTask.isQueued = false;
        }
        throw error;
      }
    } else {
      // No catch in prod code path.

      // hasTimeRemaining 固定位 true
      // initialTime 为时间切片中，port1 触发 message 执行 performWorkUntilDeadline 的时间
      // workLoop 的结果，会在时间切片中作为是否结束的依据
      return workLoop(hasTimeRemaining, initialTime);
    }
  } finally {
    currentTask = null;
    currentPriorityLevel = previousPriorityLevel; // workLoop 中可能会修改优先级
    isPerformingWork = false;
    if (enableProfiling) {
      const currentTime = getCurrentTime();
      markSchedulerSuspended(currentTime);
    }
  }
}

function workLoop(hasTimeRemaining, initialTime) {
  let currentTime = initialTime;

  // 由于 requestHostCallback(flushWork) 可能是请求定时调度，而且本身就是异步执行
  // 所以每次执行 workLoop，都需要检查一次 timerQueue 中的过期任务
  advanceTimers(currentTime);

  // currentTask 先取 taskQueue 堆顶
  // 如果 currentTask.callback 的返回值仍是函数，那么会再赋值到 currentTask
  currentTask = peek(taskQueue);

  while (
    currentTask !== null &&
    // enableSchedulerDebugging 没有开启，无视下面这行代码 
    !(enableSchedulerDebugging && isSchedulerPaused)
  ) {

    // expirationTime > currentTime 表示任务未过期
    // 时间切片中触发 performWorkUntilDeadline，执行 flushWork，执行 workLoop
    // shouldYieldToHost() 中 deadline 在执行 flushWork 前确定
    // 也就是触发 performWorkUntilDeadline 的时间 + 5
    // shouldYieldToHost() 为 true，表示 while 循环执行的时间超过了 5 毫秒
    // 所以可以简单的理解为，有大量任务执行时，每 5 毫秒中断一次
    if (
      currentTask.expirationTime > currentTime &&
      (!hasTimeRemaining || shouldYieldToHost())
    ) {
      // This currentTask hasn't expired, and we've reached the deadline.
      break;
    }

    const callback = currentTask.callback;
    if (typeof callback === 'function') {
      currentTask.callback = null; // 清理 currentTask 上的回调
      currentPriorityLevel = currentTask.priorityLevel; // 当前任务的优先级覆盖至全局
      const didUserCallbackTimeout = currentTask.expirationTime <= currentTime; // 是否已过期 

      markTaskRun(currentTask, currentTime); // 无视

      // 执行 task 的回调
      const continuationCallback = callback(didUserCallbackTimeout);
      
      currentTime = getCurrentTime();

      if (typeof continuationCallback === 'function') {
        // 回调的返回值如果是函数，那么重新赋值到 currentTask.callback，在下一轮循环中执行

        currentTask.callback = continuationCallback;
        markTaskYield(currentTask, currentTime); // 无视
      } else {
        // 如果不是函数，那么从 taskQueue 中尝试移除
        
        if (enableProfiling) {
          markTaskCompleted(currentTask, currentTime);
          currentTask.isQueued = false;
        }
        if (currentTask === peek(taskQueue)) {
          pop(taskQueue);
        }
      }

      // 每执行完一个任务，都要查询一下 timerQueue 中的过期任务
      advanceTimers(currentTime);
    } else {
      pop(taskQueue);
    }

    // 取 taskQueue 的堆顶，尝试下一轮循环
    currentTask = peek(taskQueue);
  }

  // Return whether there's additional work

  // 循环结束有两种情况
  if (currentTask !== null) {
    // currentTask 有值，则表示每 5 毫秒的中断
    // return true 之后
    // 时间切片中会由 port2 再次派发 message 
    // port1 的 message 事件异步触发后，执行 performWorkUntilDeadline
    // 此时 scheduledHostCallback 仍然保存着 flushWork
    // 执行 flushWork，再次进入 workLoop
    // 一直循环 ...
    // 直到 taskQueue 为空，进入下面的 else 处理

    return true;
  } else {
    // taskQueue 为空，return false，告知时间切片过期任务全部处理完成
    // 同时尝试请求定时调度 timerQueue 中的堆顶任务

    const firstTimer = peek(timerQueue);
    if (firstTimer !== null) {
      requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
    }
    return false;
  }
}

function unstable_runWithPriority(priorityLevel, eventHandler) {
  switch (priorityLevel) {
    case ImmediatePriority:
    case UserBlockingPriority:
    case NormalPriority:
    case LowPriority:
    case IdlePriority:
      break;
    default:
      priorityLevel = NormalPriority;
  }

  // 记录当前的优先级
  // 将传入的优先级赋值到全局
  var previousPriorityLevel = currentPriorityLevel;
  currentPriorityLevel = priorityLevel;

  try {
    // 回调执行过程中，获取到的优先级其实就是传入的优先级
    return eventHandler();
  } finally {
    // 回调执行完成后，再还原成之前的优先级
    currentPriorityLevel = previousPriorityLevel;
  }
}

function unstable_next(eventHandler) {
  var priorityLevel;
  switch (currentPriorityLevel) {
    case ImmediatePriority:
    case UserBlockingPriority:
    case NormalPriority:
      // Shift down to normal priority
      priorityLevel = NormalPriority;
      break;
    default:
      // Anything lower than normal priority should remain at the current level.
      priorityLevel = currentPriorityLevel;
      break;
  }

  var previousPriorityLevel = currentPriorityLevel;
  currentPriorityLevel = priorityLevel;

  try {
    return eventHandler();
  } finally {
    currentPriorityLevel = previousPriorityLevel;
  }
}

function unstable_wrapCallback(callback) {
  var parentPriorityLevel = currentPriorityLevel;
  return function() {
    // This is a fork of runWithPriority, inlined for performance.
    var previousPriorityLevel = currentPriorityLevel;
    currentPriorityLevel = parentPriorityLevel;

    try {
      return callback.apply(this, arguments);
    } finally {
      currentPriorityLevel = previousPriorityLevel;
    }
  };
}

function unstable_scheduleCallback(priorityLevel, callback, options) {
  var currentTime = getCurrentTime();

  // 任务开始时间
  // 传入了 options.delay，startTime = 当前时间 + options.delay
  // 未传入，则 startTime = 当前时间
  var startTime;
  if (typeof options === 'object' && options !== null) {
    var delay = options.delay;
    if (typeof delay === 'number' && delay > 0) {
      startTime = currentTime + delay;
    } else {
      startTime = currentTime;
    }
  } else {
    startTime = currentTime;
  }

  // 不同优先级对应不同过期时长
  // 优先级越低，过期时长越长，也就是越晚过期
  var timeout;
  switch (priorityLevel) {
    case ImmediatePriority:
      timeout = IMMEDIATE_PRIORITY_TIMEOUT; // -1
      break;
    case UserBlockingPriority:
      timeout = USER_BLOCKING_PRIORITY_TIMEOUT; // 250
      break;
    case IdlePriority:
      timeout = IDLE_PRIORITY_TIMEOUT; // 1073741823
      break;
    case LowPriority:
      timeout = LOW_PRIORITY_TIMEOUT; // 10000
      break;
    case NormalPriority:
    default:
      timeout = NORMAL_PRIORITY_TIMEOUT; // 5000
      break;
  }

  // 任务过期时间
  var expirationTime = startTime + timeout;

  // 开始时间和过期时间共同决定了任务的执行时机
  // immediate 的过期时长为 -1，任务的过期时间比开始时间还小
  // 所以在没有刻意 delay 的情况下，就会立即执行

  // 新建 task
  var newTask = {
    id: taskIdCounter++,   // id 累加
    callback,              // 接受调度的任务
    priorityLevel,         // 优先级
    startTime,             // 任务开始时间
    expirationTime,        // 任务过期时间
    sortIndex: -1,         // task 在堆中的排序编号
  };
  if (enableProfiling) {
    newTask.isQueued = false;
  }

  if (startTime > currentTime) {
    // 有传入 options.delay，startTime 才会大于 currentTime
    // 表示该任务延迟调度

    // 使用开始时间作为排序编号，并将任务放入 timerQueue
    newTask.sortIndex = startTime; 
    push(timerQueue, newTask);

    // 如果 taskQueue 中没有任务，且 newTask 处在 timerQueue 堆顶
    // 那么请求定时调度 newTask
    if (peek(taskQueue) === null && newTask === peek(timerQueue)) {
      if (isHostTimeoutScheduled) {
        // 定时器正在运行，则需要先清除已经存在的定时器
        cancelHostTimeout();
      } else {
        // 定时器未运行，则切换至运行状态
        isHostTimeoutScheduled = true;
      }

      requestHostTimeout(handleTimeout, startTime - currentTime);
    }
  } else {
    // 未传入 options.delay
    // 表示该任务立即调度

    // 使用过期时间作为排序编号，并将任务放入 taskQueue
    newTask.sortIndex = expirationTime;
    push(taskQueue, newTask);

    if (enableProfiling) {
      markTaskStart(newTask, currentTime);
      newTask.isQueued = true;
    }
    // Schedule a host callback, if needed. If we're already performing work,
    // wait until the next time we yield.
    // 如果 HostCallbackScheduled 处于为调度状态，且 PerformingWork 也处于未工作状态
    // 那么立即请求调度
    if (!isHostCallbackScheduled && !isPerformingWork) {
      isHostCallbackScheduled = true;
      requestHostCallback(flushWork);
    }
  }

  return newTask;
}

function unstable_pauseExecution() {
  isSchedulerPaused = true;
}

function unstable_continueExecution() {
  isSchedulerPaused = false;
  if (!isHostCallbackScheduled && !isPerformingWork) {
    isHostCallbackScheduled = true;
    requestHostCallback(flushWork);
  }
}

function unstable_getFirstCallbackNode() {
  return peek(taskQueue);
}

function unstable_cancelCallback(task) {
  if (enableProfiling) {
    if (task.isQueued) {
      const currentTime = getCurrentTime();
      markTaskCanceled(task, currentTime);
      task.isQueued = false;
    }
  }

  // Null out the callback to indicate the task has been canceled. (Can't
  // remove from the queue because you can't remove arbitrary nodes from an
  // array based heap, only the first one.)
  task.callback = null;
}

function unstable_getCurrentPriorityLevel() {
  return currentPriorityLevel;
}

const unstable_requestPaint = requestPaint;

export {
  ImmediatePriority as unstable_ImmediatePriority,
  UserBlockingPriority as unstable_UserBlockingPriority,
  NormalPriority as unstable_NormalPriority,
  IdlePriority as unstable_IdlePriority,
  LowPriority as unstable_LowPriority,
  unstable_runWithPriority,
  unstable_next,
  unstable_scheduleCallback,
  unstable_cancelCallback,
  unstable_wrapCallback,
  unstable_getCurrentPriorityLevel,
  shouldYieldToHost as unstable_shouldYield,
  unstable_requestPaint,
  unstable_continueExecution,
  unstable_pauseExecution,
  unstable_getFirstCallbackNode,
  getCurrentTime as unstable_now,
  forceFrameRate as unstable_forceFrameRate,
};

export const unstable_Profiling = enableProfiling
  ? {
      startLoggingProfilingEvents,
      stopLoggingProfilingEvents,
      sharedProfilingBuffer,
    }
  : null;

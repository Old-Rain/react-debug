/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {enableIsInputPending} from '../SchedulerFeatureFlags';

/** 请求执行调度的任务 */
export let requestHostCallback;

/** 清理调度的任务 */
export let cancelHostCallback;

/** 请求一个定时器 */
export let requestHostTimeout;

/** 清理定时器 */
export let cancelHostTimeout;

/** 
 * 是否需要打断
 * return getCurrentTime() >= deadline
 */
export let shouldYieldToHost;
export let requestPaint;

/** 
 * 获取应用已运行了多少时间，单位毫秒
 * return performance.now()
 */
export let getCurrentTime;

/** 强制修改帧率，默认 5 */
export let forceFrameRate;

const hasPerformanceNow =
  typeof performance === 'object' && typeof performance.now === 'function';

if (hasPerformanceNow) {
  const localPerformance = performance;
  getCurrentTime = () => localPerformance.now();
} else {
  const localDate = Date;
  const initialTime = localDate.now();
  getCurrentTime = () => localDate.now() - initialTime;
}

if (
  // If Scheduler runs in a non-DOM environment, it falls back to a naive
  // implementation using setTimeout.
  typeof window === 'undefined' ||
  // Check if MessageChannel is supported, too.
  typeof MessageChannel !== 'function'
) {
  // If this accidentally gets imported in a non-browser environment, e.g. JavaScriptCore,
  // fallback to a naive implementation.
  let _callback = null;
  let _timeoutID = null;
  const _flushCallback = function() {
    if (_callback !== null) {
      try {
        const currentTime = getCurrentTime();
        const hasRemainingTime = true;
        _callback(hasRemainingTime, currentTime);
        _callback = null;
      } catch (e) {
        setTimeout(_flushCallback, 0);
        throw e;
      }
    }
  };
  requestHostCallback = function(cb) {
    if (_callback !== null) {
      // Protect against re-entrancy.
      setTimeout(requestHostCallback, 0, cb);
    } else {
      _callback = cb;
      setTimeout(_flushCallback, 0);
    }
  };
  cancelHostCallback = function() {
    _callback = null;
  };
  requestHostTimeout = function(cb, ms) {
    _timeoutID = setTimeout(cb, ms);
  };
  cancelHostTimeout = function() {
    clearTimeout(_timeoutID);
  };
  shouldYieldToHost = function() {
    return false;
  };
  requestPaint = forceFrameRate = function() {};
} else {
  // Capture local references to native APIs, in case a polyfill overrides them.
  const setTimeout = window.setTimeout;
  const clearTimeout = window.clearTimeout;

  if (typeof console !== 'undefined') {
    // TODO: Scheduler no longer requires these methods to be polyfilled. But
    // maybe we want to continue warning if they don't exist, to preserve the
    // option to rely on it in the future?
    const requestAnimationFrame = window.requestAnimationFrame;
    const cancelAnimationFrame = window.cancelAnimationFrame;

    if (typeof requestAnimationFrame !== 'function') {
      // Using console['error'] to evade Babel and ESLint
      console['error'](
        "This browser doesn't support requestAnimationFrame. " +
          'Make sure that you load a ' +
          'polyfill in older browsers. https://reactjs.org/link/react-polyfills',
      );
    }
    if (typeof cancelAnimationFrame !== 'function') {
      // Using console['error'] to evade Babel and ESLint
      console['error'](
        "This browser doesn't support cancelAnimationFrame. " +
          'Make sure that you load a ' +
          'polyfill in older browsers. https://reactjs.org/link/react-polyfills',
      );
    }
  }

  let isMessageLoopRunning = false; // messageLoop 是否正在执行
  let scheduledHostCallback = null; // 保存调度的回调，到期执行
  let taskTimeoutID = -1; // timeout 的 id，用于清理

  // Scheduler periodically yields in case there is other work on the main
  // thread, like user events. By default, it yields multiple times per frame.
  // It does not attempt to align with frame boundaries, since most tasks don't
  // need to be frame aligned; for those that do, use requestAnimationFrame.
  let yieldInterval = 5; // 时间切片间隔
  let deadline = 0; // 到期时间

  // enableIsInputPending 未开启的情况下，用不上
  // TODO: Make this configurable
  // TODO: Adjust this based on priority?
  const maxYieldInterval = 300;
  let needsPaint = false;

  if (
    enableIsInputPending &&
    navigator !== undefined &&
    navigator.scheduling !== undefined &&
    navigator.scheduling.isInputPending !== undefined
  ) {
    const scheduling = navigator.scheduling;
    shouldYieldToHost = function() {
      const currentTime = getCurrentTime();
      if (currentTime >= deadline) {
        // There's no time left. We may want to yield control of the main
        // thread, so the browser can perform high priority tasks. The main ones
        // are painting and user input. If there's a pending paint or a pending
        // input, then we should yield. But if there's neither, then we can
        // yield less often while remaining responsive. We'll eventually yield
        // regardless, since there could be a pending paint that wasn't
        // accompanied by a call to `requestPaint`, or other main thread tasks
        // like network events.
        if (needsPaint || scheduling.isInputPending()) {
          // There is either a pending paint or a pending input.
          return true;
        }
        // There's no pending input. Only yield if we've reached the max
        // yield interval.
        return currentTime >= maxYieldInterval;
      } else {
        // There's still time left in the frame.
        return false;
      }
    };

    requestPaint = function() {
      needsPaint = true;
    };
  } else {
    // `isInputPending` is not available. Since we have no way of knowing if
    // there's pending input, always yield at the end of the frame.
    shouldYieldToHost = function() {
      const currentTime = getCurrentTime()

      // if (currentTime >= deadline) {
      //   console.log('shouldYieldToHost currentTime', currentTime);
      //   console.log('shouldYieldToHost deadline', deadline);
      // }
      
      return currentTime >= deadline;
    };

    // Since we yield every frame regardless, `requestPaint` has no effect.
    requestPaint = function() {};
  }

  forceFrameRate = function(fps) {
    if (fps < 0 || fps > 125) {
      // Using console['error'] to evade Babel and ESLint
      console['error'](
        'forceFrameRate takes a positive int between 0 and 125, ' +
          'forcing frame rates higher than 125 fps is not supported',
      );
      return;
    }
    if (fps > 0) {
      yieldInterval = Math.floor(1000 / fps);
    } else {
      // reset the framerate
      yieldInterval = 5;
    }
  };

  // 执行到期的任务单元
  const performWorkUntilDeadline = () => {
    // console.log('performWorkUntilDeadline', performance.now());
    
    // console.log('调度回调执行');
    if (scheduledHostCallback !== null) {
      const currentTime = getCurrentTime();
      // Yield after `yieldInterval` ms, regardless of where we are in the vsync
      // cycle. This means there's always time remaining at the beginning of
      // the message event.

      // 到期时间 = 当前时间 + 时间切片间隔
      deadline = currentTime + yieldInterval;
      const hasTimeRemaining = true;
      try {
        // 执行 requestHostCallback 中保存的 callback
        // 传入 true 和 当前运行时间，并获取结果
        const hasMoreWork = scheduledHostCallback(
          hasTimeRemaining,
          currentTime,
        );

        // 没有更多需要执行的工作，重置这两个容器变量
        // 否则，由 channel.port2 继续派发 message
        if (!hasMoreWork) {
          isMessageLoopRunning = false;
          scheduledHostCallback = null;
        } else {
          // console.log('这里？');
          
          // If there's more work, schedule the next message event at the end
          // of the preceding one.
          port.postMessage(null);
        }
      } catch (error) {
        // If a scheduler task throws, exit the current browser task so the
        // error can be observed.
        port.postMessage(null);
        throw error;
      }
    } else {
      isMessageLoopRunning = false;
    }
    // Yielding to the browser will give it a chance to paint, so we can
    // reset this.
    needsPaint = false;
  };

  const channel = new MessageChannel();
  const port = channel.port2;
  channel.port1.onmessage = performWorkUntilDeadline;

  requestHostCallback = function(callback) {
    // 先将传入的回调保存到 scheduledHostCallback
    scheduledHostCallback = callback;
    
    // 如果 isMessageLoopRunning 处于 false 状态
    // 那么，改变其状态为 true，port2 派发 message，触发 port1 的 message 事件，执行 performWorkUntilDeadline
    if (!isMessageLoopRunning) {
      isMessageLoopRunning = true;
      port.postMessage(null);
    }
  };

  cancelHostCallback = function() {
    // 重置 scheduledHostCallback 为 null
    scheduledHostCallback = null;
  };

  requestHostTimeout = function(callback, ms) {
    // ms 毫秒后执行 callback，并传入 getCurrentTime()
    taskTimeoutID = setTimeout(() => {
      callback(getCurrentTime());
    }, ms);
  };

  cancelHostTimeout = function() {
    // 清除 requestHostTimeout 所产生的定时器
    clearTimeout(taskTimeoutID);
    taskTimeoutID = -1;
  };
}

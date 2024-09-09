/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

export type PriorityLevel = 0 | 1 | 2 | 3 | 4 | 5;

// TODO: Use symbols?
export const NoPriority = 0; // 初始化时的无优先级
export const ImmediatePriority = 1; // 立即执行的优先级。最高的优先级
export const UserBlockingPriority = 2; // 用户触发更新的优先级。如在click事件中执行setState
export const NormalPriority = 3; // 一般优先级。比较常见的优先级，如请求服务端的数据，返回数据后更新状态
export const LowPriority = 4; // 低优先级。如Suspense
export const IdlePriority = 5; // 最低的优先级，空闲时才执行

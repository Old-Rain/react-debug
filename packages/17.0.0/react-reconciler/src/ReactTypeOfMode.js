/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

export type TypeOfMode = number;

export const NoMode = 0b00000; // 没有模式 0
export const StrictMode = 0b00001; // 严格模式 1
// TODO: Remove BlockingMode and ConcurrentMode by reading from the root
// tag instead
export const BlockingMode = 0b00010; // Blocking模式 2
export const ConcurrentMode = 0b00100; // Concurrent模式 4
export const ProfileMode = 0b01000;
export const DebugTracingMode = 0b10000;

// 极简 useState 实现 注释

// 3. mount 与 update 的表现会不同
// 需要一个变量来判断，react 源码通过双缓存 fiber 树实现，这里不用这么复杂
let isMount = false

// 2.3. hooks 也是链表结构，所以需要一个全局变量做为中间存储，用来指向当前正在执行的 hook
let workInProgressHook = null

// 2. 需要一个 fiber 对象与 APP 组件对应
const fiber = {
  stateNode: APP, // 2.1 fiber 对应的组件
  memoizedState: null, // 2.2 hooks 以链表的形式存在该属性上
}

// 6. dispatchAction
function dispatchAction(queue, action) {
  const update = {
    action, // setState 传入的 payload
    next: null, // 指向下一个 update 形成链表（环）
  }

  // queue.pending 指向 update 链表环的尾
  // 所以要判断是否已存在链表环
  if (!queue.pending) {
    // queue.pending 为空

    update.next = update // update.next 指向自己形成环
  } else {
    // 插入 newU
    // queue.pending: u4 → u1
    //                ↑    ↓
    //                u3 ← u2

    //                     newU
    //                      ↓
    // queue.pending: u4 → u1
    //                ↑    ↓
    //                u3 ← u2
    update.next = queue.pending.next

    //                     newU
    //                  ↗  ↓
    // queue.pending: u4    u1
    //                ↑    ↓
    //                u3 ← u2
    queue.pending.next = update

    // queue.pending: newU   →    u1
    //                 ↑          ↓
    //                 u4 ← u3 ← u2
    // queue.pending = update // 最后修改pending的指向，代码重复，所以这行不用写
  }

  queue.pending = update

  // update 创建完成后，重新执行整个流程
  run()
}

// 5. useState
// initialState 也可以传函数，这里省略掉
function useState(initialState) {
  let hook // 5.1. 定义一个 hook

  // 5.2. 区分 mount 和 update
  if (!isMount) {
    // 先创建 hook 的数据结构，hook 用来保存 update 对象
    // 所以 hook 的数据结构和 ClassComponent 的 updateQueue 是类似的
    // 忽略掉优先级的概念，所以省略 baseState 和 baseUpdate
    hook = {
      queue: {
        pending: null, // pending 指向 update 对象链表环的最后一个
      },
      memoizedState: initialState, // 保存 hook 的值，mount 时就是传入的 initialState
      next: null, // 指向下一个 hook，形成单向链表
    }

    // 创建 hook 之后，还要判断 fiber 是否已经创建过 hook，
    if (!fiber.memoizedState) {
      // 首次创建，将 hook 添加到 fiber.memoizedState

      fiber.memoizedState = hook
    } else {
      // 已存在 hook，则需要往 workInProgressHook 的尾部添加

      workInProgressHook.next = hook
    }

    workInProgressHook = hook
    // 首次创建
    // fiber.memoizedState: h1
    // workInProgressHook: h1
    //
    // 后续创建
    // fiber.memoizedState: h1 → h2
    // workInProgressHook: h2
    //
    // 后续创建
    // fiber.memoizedState: h1 → h2 → h3
    // workInProgressHook: h3
  } else {
    // update 时，从全局变量依次往下取即可

    hook = workInProgressHook
    workInProgressHook = workInProgressHook.next // 取过之后，赋值为下一个

    // 这也就是为什么不能将 hook 写在循环体中的原因
  }

  // 上面的过程类似 ClassComponent 创建 update
  // 下面开始计算 state

  // 由于省略了优先级的概念，所以按照 SyncRoot 的模式，baseState 就是 memoizedState
  let baseState = hook.memoizedState

  // 如果 pending 上添加了 update 对象，说明有需要执行的更新
  if (hook.queue.pending) {
    // ClassComponent 中的 updateQueue.shared.pending 是 update 链表环的尾
    // hooks 中与之相同

    let update = hook.queue.pending.next
    do {
      const action = update.action // action 就是调用 setState 的入参，这里简化成只做 function 处理
      baseState = action(baseState)

      update = update.next
    } while (update !== hook.queue.pending.next) // 终止条件就是回到第一个 update 时

    // 遍历结束后
    hook.queue.pending = null // 将 pending 置为 null，表示所有 update 都已经执行
    hook.memoizedState = baseState // 将新的 state 赋值到 memoizedState
  }

  // 最后返回 state 和 dispatchAction
  // dispatchAction 的作用是创建 update，并形成环状链表，所以这里需要把 queue 默认传入
  return [hook.memoizedState, dispatchAction.bind(null, hook.queue)]
}

// 1. 假设 APP 组件，省去页面相关操作，只 return 一个对象
// APP 组件中使用 useState 初始化变量
function APP() {
  const [count, setCount] = useState(0)
  const [trigger, setTrigger] = useState(false)

  console.log('----------')
  console.log('isMount', isMount)
  console.log('count', count)
  console.log('trigger', trigger)
  console.log('----------')

  return {
    onClick: () => {
      setCount((value) => value + 1)
      setCount((value) => value + 1)
      setCount((value) => value + 1)
    },
    onTrigger: () => {
      setTrigger((value) => !value)
    },
  }
}

// 4. 模拟 render 阶段
// 将结果赋值到 window.app 便于控制台观察
function run() {
  // 4.1. 开始工作的时候，workInProgressHook 赋值为 fiber.memoizedState，回到第一个 hook

  // mount 时，每个 useState 都会生成 hook，通过 next 指针形成链表，并将第一个 hook 赋值到 fiber.memoizedState
  // update 时，复用 hook，顺着 next 指针往下取
  workInProgressHook = fiber.memoizedState

  const app = fiber.stateNode()

  isMount = true

  return app
}

window.app = run()

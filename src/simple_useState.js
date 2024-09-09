// 极简 useState 实现

let isMount = false

let workInProgressHook = null

const fiber = {
  stateNode: APP,
  memoizedState: null,
}

function dispatchAction(queue, action) {
  const update = {
    action,
    next: null,
  }

  if (!queue.pending) {
    update.next = update
  } else {
    update.next = queue.pending.next
    queue.pending.next = update
  }

  queue.pending = update

  run()
}

function useState(initialState) {
  let hook

  if (!isMount) {
    hook = {
      queue: {
        pending: null,
      },
      memoizedState: initialState,
      next: null,
    }

    if (!fiber.memoizedState) {
      fiber.memoizedState = hook
    } else {
      workInProgressHook.next = hook
    }

    workInProgressHook = hook
  } else {
    hook = workInProgressHook
    workInProgressHook = workInProgressHook.next
  }

  let baseState = hook.memoizedState

  if (hook.queue.pending) {
    let update = hook.queue.pending.next
    do {
      const action = update.action
      baseState = action(baseState)

      update = update.next
    } while (update !== hook.queue.pending.next)

    hook.queue.pending = null
    hook.memoizedState = baseState
  }

  return [hook.memoizedState, dispatchAction.bind(null, hook.queue)]
}

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

function run() {
  workInProgressHook = fiber.memoizedState

  const app = fiber.stateNode()

  isMount = true

  return app
}

window.app = run()

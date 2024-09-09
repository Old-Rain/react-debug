// 源码中模块的根文件使用的是局部导出
import * as React from 'react'
import * as ReactDOM from 'react-dom'

const { useState, useReducer, useEffect, useLayoutEffect, useRef } = React

const reducer = (state, action) => {
  switch (action.type) {
    case 'increment':
      return {
        ...state,
        count: state.count + 1,
      }

    case 'decrement':
      return {
        ...state,
        count: state.count - 1,
      }

    default:
      return state
  }
}

let limt = 0

// useState 和 useReducer
// useEffect 和 useLayoutEffect
const APP6 = () => {
  const [state, dispatch] = useReducer(reducer, { count: 0 })
  // const [state2, dispatch2] = useReducer(reducer, { count: 0 })

  if (limt < 1) {
    // dispatch({ type: 'increment' })
    limt++
  }

  // console.log('state', state)

  useLayoutEffect(() => {
    console.log('useLayoutEffect', state.count)
  }, [state.count])

  useEffect(() => {
    console.log('useEffect', state.count)
  }, [state.count])

  return (
    <main>
      <div>{state.count}</div>
      <button
        onClick={() => {
          dispatch({ type: 'increment' })
          // dispatch({ type: 'increment' })
        }}
      >
        +
      </button>

      <button
        onClick={() => {
          dispatch({ type: 'decrement' })
        }}
      >
        -
      </button>
    </main>
  )
}

ReactDOM.render(<APP6 />, document.getElementById('root'))
// ReactDOM.createRoot(document.getElementById('root')).render(<APP6 />)

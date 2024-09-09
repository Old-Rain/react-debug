// 源码中模块的根文件使用的是局部导出
import * as React from 'react'
import * as ReactDOM from 'react-dom'

const { useState, useEffect, useLayoutEffect, useRef } = React

// diff 算法
const APP3 = () => {
  const [count, setCount] = useState(0)

  // const a = (
  //   <div>
  //     <p key="D">D</p>
  //     <span key="C">C</span>
  //   </div>
  // )

  // const b = (
  //   <div>
  //     <span key="C">C</span>
  //     <p key="D">D</p>
  //   </div>
  // )

  const a = (
    <ul>
      <li key="A" title="A1">
        A
      </li>
      <li key="B" title="B1">
        B
      </li>
      <li key="C" title="C1">
        C
      </li>
    </ul>
  )

  const b = (
    <ul>
      <li key="A" title="A2">
        A
      </li>
      <li key="C" title="C2">
        C
      </li>
      <li key="B" title="B2">
        B
      </li>
    </ul>
  )

  return (
    <main
      onClick={() => {
        setCount(count + 1)
      }}
    >
      {count % 2 === 0 ? a : b}
    </main>
  )
}

ReactDOM.render(<APP3 />, document.getElementById('root'))
// ReactDOM.createRoot(document.getElementById('root')).render(<APP3 />)

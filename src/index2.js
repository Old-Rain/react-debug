// 源码中模块的根文件使用的是局部导出
import * as React from 'react'
import * as ReactDOM from 'react-dom'

const { useState, useEffect, useLayoutEffect, useRef } = React


// useEffect 和 useLayoutEffect
const APP2 = () => {
  const [count, setCount] = useState(0)

  // useEffect(() => {
  useLayoutEffect(() => {
    if (count === 0) {
      const randomNum = 10 + Math.random() * 200

      const now = performance.now()

      while (performance.now() - now < 300) {}

      setCount(randomNum)
    }
  }, [count])

  return (
    <div
      onClick={() => {
        setCount(0)
      }}
    >
      {count}
    </div>
  )
}

ReactDOM.render(<APP2 />, document.getElementById('root'))
// ReactDOM.createRoot(document.getElementById('root')).render(<APP2 />)
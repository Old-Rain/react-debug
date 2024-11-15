// 源码中模块的根文件使用的是局部导出
import * as React from 'react'
import * as ReactDOM from 'react-dom'

const { useState, useEffect, useLayoutEffect, useRef } = React

// 优先级与 Update
const APP4 = () => {
  const buttonR = useRef(null)
  const [count, setCount] = useState(0)

  const handleClick = () => {
    // setCount(count + 2) // 不能这样写
    setCount((count) => count + 2)
  }

  useEffect(() => {
    console.log('====首屏完成====');

    // 首屏渲染完成的 1000 毫秒后设置 count 为 1，优先级为 NormalPriority
    setTimeout(() => {
      console.log('第 1 个 setCount', performance.now());
      setCount(1)
    }, 1000)

    // 再过 40 毫秒触发用户事件，优先级为 UserBlockingPriority
    setTimeout(() => {
      console.log('第 2 个 setCount', performance.now());
      buttonR.current.click()
    }, 1040)
  }, [])

  return (
    <main>
      <button ref={buttonR} onClick={handleClick}>
        +2
      </button>

      {/* 页面上渲染 50000 个 span，span 中显示 count */}
      <div>
        {Array.from(new Array(50000)).map((item, index) => {
          return <span key={index}>{count}</span>
        })}
      </div>
    </main>
  )
}

// ReactDOM.render(<APP4 />, document.getElementById('root'))
ReactDOM.createRoot(document.getElementById('root')).render(<APP4 />)

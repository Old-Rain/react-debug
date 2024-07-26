// 源码中模块的根文件使用的是局部导出
import * as React from 'react'
import * as ReactDOM from 'react-dom'

const { useState } = React

const APP = () => {
  const [count, setCount] = useState(0)

  return (
    <div>
      <img width="100" height="100" title="" alt="" />
      <h1>
        hellow <span>world</span>
      </h1>
      count:{count}
      <button
        onClick={() => {
          setCount((v) => v + 1)
        }}
      >
        点我
      </button>
    </div>
  )
}

ReactDOM.render(<APP />, document.getElementById('root'))
// ReactDOM.createRoot(document.getElementById('root')).render(<APP />)
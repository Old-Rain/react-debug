// 源码中模块的根文件使用的是局部导出
import * as React from "react"
import * as ReactDOM from "react-dom"

const { useState, useEffect, useLayoutEffect, useRef } = React

// scheduler 模块
const APP7 = () => {
  // useEffect(() => {
  //   console.log(1)
  // }, [])

  return (
    <ul
      // onClick={() => {
      //   debugger
      // }}
    >
      {new Array(3000).fill(0).map((_, i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  )
}

// ReactDOM.render(<APP7 />, document.getElementById('root'))
ReactDOM.createRoot(document.getElementById("root")).render(<APP7 />)

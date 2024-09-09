// 源码中模块的根文件使用的是局部导出
import * as React from 'react'
import * as ReactDOM from 'react-dom'

const { useState, useEffect, useLayoutEffect, useRef } = React

// this.setState流程
class APP5 extends React.Component {
  state = {
    count: 0,
  }

  render() {
    return (
      <div
        onClick={() => {
          debugger
          this.setState((state) => ({ count: state.count + 1 }))
        }}
      >
        {this.state.count}
      </div>
    )
  }
}

ReactDOM.render(<APP5 />, document.getElementById('root'))

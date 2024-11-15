// 源码中模块的根文件使用的是局部导出
import * as React from "react"
import * as ReactDOM from "react-dom"

const { Component } = React

// batchedUpdates
class APP8 extends Component {
  state = {
    count: 0,
  }

  handlerClick = () => {
    setTimeout(() => {
      // debugger
      this.setState({
        count: this.state.count + 1,
      })
      this.setState({
        count: this.state.count + 1,
      })
    }, 0)
  }

  render() {
    console.log("render")

    return <div onClick={this.handlerClick}>{this.state.count}</div>
  }
}

// ReactDOM.render(<APP8 />, document.getElementById("root"))
ReactDOM.createRoot(document.getElementById("root")).render(<APP8 />)

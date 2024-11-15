// 源码中模块的根文件使用的是局部导出
import * as React from 'react'
import * as ReactDOM from 'react-dom'

const { useState, useEffect, useLayoutEffect, useRef } = React

const APP = () => {
  const [count, setCount] = useState(0)

  useLayoutEffect(() => {
    if (count === 2) {
      setCount(count + 'layout')
    }
  }, [count])

  useEffect(() => {
    console.log(count)
  }, [count])

  return (
    <div>
      <main>
        <code title={count}>{count}</code>
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
        <button onClick={clickHe}>点他</button>
        <button onClick={() => {}}>点你</button>
        <Item1 count={count} />
        <Item2 />
      </main>
    </div>
  )
}

class Item1 extends React.Component {
  render() {
    return this.props.count === 1 ? <em>count === 1</em> : null
  }
}

class Item2 extends React.Component {
  render() {
    return <p>Item2组件是p标签</p>
  }
}

function clickHe() {}

// ReactDOM.render(<APP />, document.getElementById('root'))
ReactDOM.createRoot(document.getElementById('root')).render(<APP />)

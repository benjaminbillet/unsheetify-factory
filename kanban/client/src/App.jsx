import Board from './components/Board/Board.jsx'
import './App.css'

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Kanban Board</h1>
      </header>
      <main className="app-main">
        <Board />
      </main>
    </div>
  )
}

export default App

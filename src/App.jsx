import { Routes, Route } from 'react-router-dom'
import Login from './pages/Login.jsx'
import Landing from './pages/Landing.jsx'

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
      </Routes>
    </>
  )
}

export default App

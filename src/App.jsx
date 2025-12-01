import { Routes, Route } from 'react-router-dom'
import Login from './pages/Login.jsx'
import Landing from './pages/Landing.jsx'
import Notfound from './pages/Notfound.jsx'

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<Notfound />} />
      </Routes>
    </>
  )
}

export default App

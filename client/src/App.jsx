import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import Navbar from './components/Navbar.jsx';
import HomePage from './pages/HomePage.jsx';
import NotebooksPage from './pages/NotebooksPage.jsx';
import QuizPage from './pages/QuizPage.jsx';
import QuestionsPage from './pages/QuestionsPage.jsx';
import StudyPage from './pages/StudyPage.jsx';
import AboutPage from './pages/AboutPage.jsx';
import DonatePage from './pages/DonatePage.jsx';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <div className="app-container">
          <Navbar />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/notebooks" element={<NotebooksPage />} />
              <Route path="/study/:notebookId" element={<StudyPage />} />
              <Route path="/quiz/:bucket" element={<QuizPage />} />
              <Route path="/questions" element={<QuestionsPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/donate" element={<DonatePage />} />
            </Routes>
          </main>
        </div>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;

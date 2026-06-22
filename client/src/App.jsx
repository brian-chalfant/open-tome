/**
 * @file App.jsx
 * @description Root React component.
 * Sets up client-side routing with React Router.
 *
 * Routes:
 *   /                - Landing page (public)
 *   /login           - Login page (public)
 *   /signup          - Signup page (public)
 *   /app             - Main writing workspace (protected)
 *   /app/:projectId  - Workspace with a specific project (protected)
 *   /profile         - User profile and writing stats (protected)
 *   /help            - Help and keyboard shortcuts (public)
 *   *                - Catch-all redirect to /login
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import SignupPage from './pages/SignupPage.jsx';
import AppPage from './pages/AppPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import HelpPage from './pages/HelpPage.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <AppPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/:projectId"
          element={
            <ProtectedRoute>
              <AppPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route path="/help" element={<HelpPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import ProdLoginPreviewPage from './pages/ProdLoginPreviewPage';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProdLoginPreviewPage />
  </StrictMode>,
);

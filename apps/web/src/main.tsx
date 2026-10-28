import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';
import '@achoo254/app-shell/tokens.css';
import '@achoo254/app-shell/app-shell.css';
import './styles/app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { AccountProvider } from './account';
import { App } from './app';
import { I18nProvider } from './i18n';

const container = document.getElementById('root');
if (!container) throw new Error('#root missing in index.html');
createRoot(container).render(
  <StrictMode>
    <I18nProvider>
      <AccountProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AccountProvider>
    </I18nProvider>
  </StrictMode>,
);

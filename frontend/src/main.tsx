import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import App from "./App.tsx";

// Il tema lo fornisce `App`: qui c'era un secondo `ThemeProvider` con gli stessi default, e
// l'effetto che applica il tema girava due volte all'avvio.
createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <App />
    </StrictMode>
);

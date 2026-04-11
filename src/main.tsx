import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Force Vite dep cache refresh
createRoot(document.getElementById("root")!).render(<App />);

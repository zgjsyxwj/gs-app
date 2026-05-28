import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App";
import Dashboard from "./routes/Dashboard";
import Task from "./routes/Task";
import Payslip from "./routes/Payslip";
import Payroll from "./routes/Payroll";
import Settings from "./routes/Settings";
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route element={<App />}>
          <Route index element={<Dashboard />} />
          <Route path="task/va-vn-payslip-rename" element={<Payslip />} />
          <Route path="task/va-tw-payroll-split" element={<Payroll />} />
          <Route path="task/:taskId" element={<Task />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  </React.StrictMode>
);

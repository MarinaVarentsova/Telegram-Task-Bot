import { Component, type ReactNode } from "react";
import { KanbanBoard } from "@/components/kanban-board";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

class RootErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
          <div style={{ maxWidth: 480, border: "1px solid #f87171", borderRadius: 8, padding: "1.5rem", background: "#fef2f2" }}>
            <h2 style={{ color: "#dc2626", marginBottom: 8, fontSize: "1.1rem" }}>Ошибка приложения</h2>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.75rem", color: "#6b7280", textAlign: "left" }}>
              {this.state.error}
            </pre>
            <button
              style={{ marginTop: 16, padding: "8px 16px", borderRadius: 6, background: "#2563eb", color: "#fff", border: "none", cursor: "pointer" }}
              onClick={() => this.setState({ error: null })}
            >
              Попробовать снова
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <RootErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <KanbanBoard />
        <Toaster position="bottom-right" />
      </QueryClientProvider>
    </RootErrorBoundary>
  );
}

export default App;

import { KanbanBoard } from "@/components/kanban-board";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <KanbanBoard />
      <Toaster position="bottom-right" />
    </QueryClientProvider>
  );
}

export default App;

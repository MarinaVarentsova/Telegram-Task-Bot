import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, getTgIdFromUrl, UserNotFoundError } from "@/lib/supabase";
import { Task, Column, Category } from "@/lib/types";
import { toast } from "sonner";

// Stable reference: read once at module init (URL doesn't change during session)
const TG_ID = getTgIdFromUrl();

export function useBoardData() {
  const columnsQuery = useQuery({
    queryKey: ["columns"],
    queryFn: async () => {
      const data = await api.columns() as Column[];
      console.log("[kanban] fetched columns:", data.length, data);
      return data;
    },
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const data = await api.categories() as Category[];
      console.log("[kanban] fetched categories:", data.length, data);
      return data;
    },
  });

  const tasksQuery = useQuery({
    queryKey: ["tasks", TG_ID],
    // Don't run query at all when tg_id is absent
    enabled: !!TG_ID,
    retry: (failureCount, error) => {
      // Never retry user_not_found — it won't fix itself without /start
      if (error instanceof UserNotFoundError) return false;
      return failureCount < 2;
    },
    queryFn: async () => {
      // TG_ID is guaranteed non-null here because enabled: !!TG_ID
      const raw = await api.tasks(TG_ID!) as Record<string, unknown>[];
      console.log("[kanban] fetched tasks (raw):", raw.length, raw);

      const mapped: Task[] = raw.map((t) => ({
        id: String(t["id"] ?? ""),
        user_id: String(t["user_id"] ?? ""),
        title: String(t["title"] ?? t["source_text"] ?? "Без названия"),
        description: String(t["description"] ?? ""),
        source_text: (t["source_text"] as string | null) ?? null,
        deadline: (t["deadline"] as string | null) ?? null,
        board_column_id: String(t["board_column_id"] ?? ""),
        category_id: (t["category_id"] as string | null) ?? null,
        status: (t["status"] as string | null) ?? null,
        priority: (t["priority"] as string | null) ?? null,
        created_at: String(t["created_at"] ?? ""),
      }));

      console.log("[kanban] mapped tasks:", mapped);
      return mapped;
    },
  });

  const isLoading =
    columnsQuery.isLoading ||
    categoriesQuery.isLoading ||
    // Tasks only "loading" when we actually fire the query
    (!!TG_ID && tasksQuery.isLoading);

  // Separate user_not_found from generic errors
  const userNotFound = tasksQuery.error instanceof UserNotFoundError;

  const error =
    columnsQuery.error ||
    categoriesQuery.error ||
    // Don't surface user_not_found as a generic error — board handles it specially
    (!userNotFound ? tasksQuery.error : null);

  return {
    columns: columnsQuery.data ?? [],
    categories: categoriesQuery.data ?? [],
    tasks: tasksQuery.data ?? [],
    hasTgId: !!TG_ID,
    userNotFound,
    isLoading,
    error,
  };
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (updates: Partial<Task> & { id: string }) => {
      const { id, ...data } = updates;
      await api.updateTask(id, data as Record<string, unknown>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Задача сохранена");
    },
    onError: () => {
      toast.error("Ошибка при сохранении задачи");
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.deleteTask(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Задача удалена");
    },
    onError: () => {
      toast.error("Ошибка при удалении задачи");
    },
  });
}

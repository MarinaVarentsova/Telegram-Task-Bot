import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/supabase";
import { Task, Column, Category, User } from "@/lib/types";
import { toast } from "sonner";

export function useBoardData() {
  const columnsQuery = useQuery({
    queryKey: ["columns"],
    queryFn: () => api.columns() as Promise<Column[]>,
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.categories() as Promise<Category[]>,
  });

  const tasksQuery = useQuery({
    queryKey: ["tasks"],
    queryFn: () => api.tasks() as Promise<Task[]>,
  });

  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: () => api.users() as Promise<User[]>,
  });

  const isLoading =
    columnsQuery.isLoading ||
    categoriesQuery.isLoading ||
    tasksQuery.isLoading ||
    usersQuery.isLoading;

  const error =
    columnsQuery.error ||
    categoriesQuery.error ||
    tasksQuery.error ||
    usersQuery.error;

  return {
    columns: columnsQuery.data ?? [],
    categories: categoriesQuery.data ?? [],
    tasks: tasksQuery.data ?? [],
    users: usersQuery.data ?? [],
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

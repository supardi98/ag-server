import { ref } from 'vue';

export interface Conversation {
  id: string;
  title: string;
  lastModifiedTime?: string;
}

export interface Project {
  name: string;
  folderUri: string;
  conversations: Conversation[];
}

export function useProjectState() {
  const projects = ref<Project[]>([]);
  const projectsLoading = ref(false);
  const projectsRefreshing = ref(false);
  const projectsCachedAt = ref<string | null>(null);
  const expandedProjects = ref<Set<string>>(new Set());
  
  const toggleProjectExpand = (folderUri: string) => {
    if (expandedProjects.value.has(folderUri)) {
      expandedProjects.value.delete(folderUri);
    } else {
      expandedProjects.value.add(folderUri);
    }
    expandedProjects.value = new Set(expandedProjects.value);
  };

  return {
    projects,
    projectsLoading,
    projectsRefreshing,
    projectsCachedAt,
    expandedProjects,
    toggleProjectExpand,
  };
}

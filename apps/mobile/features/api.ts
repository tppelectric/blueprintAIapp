const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000";

export async function fetchProjectDashboard(projectId: string) {
  const response = await fetch(`${apiBaseUrl}/api/projects/${projectId}/dashboard`);
  if (!response.ok) {
    throw new Error(`Dashboard request failed (${response.status})`);
  }
  return (await response.json()) as {
    dashboard?: {
      project: { name: string; location: string };
      rooms: Array<unknown>;
      symbols: Array<{ needsReview: boolean }>;
      materials: Array<unknown>;
    };
  };
}

export async function fetchProjectTakeoff(projectId: string) {
  const response = await fetch(`${apiBaseUrl}/api/projects/${projectId}/takeoff`);
  if (!response.ok) {
    throw new Error(`Takeoff request failed (${response.status})`);
  }
  return (await response.json()) as {
    takeoffs?: Array<{
      roomName: string;
      counts: {
        outlet: number;
        switch: number;
        light: number;
        recessed_light: number;
      };
    }>;
  };
}

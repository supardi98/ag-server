export const QUOTA_API_ENDPOINTS = [
  'https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels',
  'https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels',
  'https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels'
];
export const LOAD_CODE_ASSIST_ENDPOINT = 'https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:loadCodeAssist';

export interface ModelQuota {
  id: string;
  name: string;
  percentage: number;
  reset_time: string;
}

export interface QuotaData {
  models: ModelQuota[];
  is_forbidden: boolean;
  subscription_tier?: string;
  raw_error?: string;
}

export async function fetchProjectIdAndTier(accessToken: string): Promise<{ projectId?: string, tier?: string }> {
  try {
    const res = await fetch(LOAD_CODE_ASSIST_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'vscode/1.X.X (Antigravity/1.0.0)'
      },
      body: JSON.stringify({ metadata: { ideType: 'ANTIGRAVITY' } })
    });

    if (!res.ok) return {};
    const data = await res.json() as any;

    let tier = data.paidTier?.name || data.paidTier?.id;
    const isIneligible = data.ineligibleTiers && data.ineligibleTiers.length > 0;
    
    if (!tier && !isIneligible) {
      tier = data.currentTier?.name || data.currentTier?.id;
    } else if (!tier && isIneligible && data.allowedTiers) {
      const defaultTier = data.allowedTiers.find((t: any) => t.isDefault);
      if (defaultTier) {
        tier = `${defaultTier.name || defaultTier.id} (Restricted)`;
      }
    }

    return { projectId: data.cloudaicompanionProject, tier };
  } catch (err) {
    console.error('Failed to load project ID and tier', err);
    return {};
  }
}

export async function fetchLiveQuota(accessToken: string): Promise<QuotaData> {
  const { projectId, tier } = await fetchProjectIdAndTier(accessToken);
  const initialPayload = projectId ? { project: projectId } : {};

  let lastStatus = 0;

  let lastErrorText = '';

  for (const endpoint of QUOTA_API_ENDPOINTS) {
    let payload = { ...initialPayload };
    let retryWithoutProject = false;

    while (true) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'vscode/1.X.X (Antigravity/1.0.0)'
        },
        body: JSON.stringify(payload)
      });

      lastStatus = res.status;

      if (res.status === 403 || res.status === 401 || res.status === 404) {
        if (!retryWithoutProject && Object.keys(payload).length > 0) {
          payload = {};
          retryWithoutProject = true;
          continue;
        }
        lastErrorText = await res.text();
        console.error(`Endpoint ${endpoint} returned ${res.status}:`, lastErrorText);
        break; // Try next endpoint
      }

      if (res.ok) {
        const data = await res.json() as any;
        const models: ModelQuota[] = [];

        if (data.models) {
          for (const [name, info] of Object.entries<any>(data.models)) {
            const lowerName = name.toLowerCase();
            
            // Exclude unwanted internal models
            if (lowerName.includes('tab_jump_flash') || lowerName.includes('tab_flash_lite') || lowerName.includes('tab_')) {
              continue;
            }

            if (lowerName.includes('gemini') || lowerName.includes('claude') || lowerName.includes('gpt') || lowerName.includes('image') || lowerName.includes('3.1') || lowerName.includes('flash')) {
              const quotaInfo = info.quotaInfo;
              if (quotaInfo) {
                const percentage = quotaInfo.remainingFraction ? Math.floor(quotaInfo.remainingFraction * 100) : 0;
                const resetTime = quotaInfo.resetTime || '';
                models.push({
                  id: name.replace('models/', '').replace('publishers/google/models/', ''),
                  name: info.displayName || name,
                  percentage,
                  reset_time: resetTime
                });
              }
            }
          }
        }

        return { models, is_forbidden: false, subscription_tier: tier };
      }

      break; // Try next endpoint on other errors
    }
  }

  if (lastStatus === 403 || lastStatus === 401 || lastStatus === 404) {
    return { models: [], is_forbidden: true, subscription_tier: tier, raw_error: lastErrorText };
  }

  throw new Error(`Quota fetch failed across all endpoints. Last status: ${lastStatus}`);
}

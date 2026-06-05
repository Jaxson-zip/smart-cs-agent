import { AfterSalesCase } from '@smart-cs-agent/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4100';

export async function fetchCases(): Promise<AfterSalesCase[]> {
  try {
    const res = await fetch(`${API_URL}/v1/cases`, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Failed to fetch cases: ${res.statusText}`);
    }
    return await res.json();
  } catch (error) {
    console.error('Error fetching cases:', error);
    throw error;
  }
}

export async function fetchCaseDetails(caseId: string): Promise<AfterSalesCase> {
  try {
    const res = await fetch(`${API_URL}/v1/cases/${caseId}`, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Failed to fetch case ${caseId}: ${res.statusText}`);
    }
    return await res.json();
  } catch (error) {
    console.error(`Error fetching case ${caseId}:`, error);
    throw error;
  }
}

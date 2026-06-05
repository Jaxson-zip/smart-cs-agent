import { NextResponse } from 'next/server';
import { mockDb } from '../../db';
import {
  disabledLegacyDemoApiResponse,
  legacyDemoApiEnabled,
} from '../legacy-demo-guard';

export async function GET() {
  if (!legacyDemoApiEnabled()) {
    return disabledLegacyDemoApiResponse();
  }

  return NextResponse.json(mockDb.orders);
}

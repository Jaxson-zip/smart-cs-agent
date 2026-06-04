import { NextResponse } from 'next/server';
import { mockDb } from '../../db';

export async function GET() {
  return NextResponse.json(mockDb.orders);
}

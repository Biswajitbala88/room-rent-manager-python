'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { format } from 'date-fns';

export default function DashboardPage() {
  const [summary, setSummary] = useState<any>(null);
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const { data } = await api.get(`/dashboard/summary?month=${month}`);
        setSummary(data);
      } catch (err) {
        console.error("Failed to fetch dashboard summary", err);
      }
    };
    fetchSummary();
  }, [month]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Filter Month:</label>
          <input 
            type="month" 
            className="rounded-lg border-gray-300 shadow-sm px-3 py-2 border focus:ring-blue-500 focus:border-blue-500"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
      </div>

      {summary ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-sm font-medium text-gray-500 mb-1">Total Tenants</h3>
            <p className="text-3xl font-bold text-gray-900">{summary.total_tenants}</p>
            <p className="text-xs text-green-600 mt-2">{summary.active_tenants} active</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-sm font-medium text-gray-500 mb-1">Pending Invoices</h3>
            <p className="text-3xl font-bold text-orange-600">{summary.pending_invoices_count}</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-sm font-medium text-gray-500 mb-1">Due Amount</h3>
            <p className="text-3xl font-bold text-red-600">₹{summary.due_amount.toFixed(2)}</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-sm font-medium text-gray-500 mb-1">Received Amount</h3>
            <p className="text-3xl font-bold text-green-600">₹{summary.received_amount.toFixed(2)}</p>
          </div>
        </div>
      ) : (
        <div className="text-gray-500">Loading summary...</div>
      )}

      {/* Due Payments Panel and Invoice Modal placeholders for phase 8 implementation */}
      <div className="mt-8 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <p className="text-sm text-gray-500">Due Payments and Invoice Creation will be implemented here.</p>
      </div>
    </div>
  );
}

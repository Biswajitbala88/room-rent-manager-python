'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { Plus, Trash2, Edit, Eye, Shield, Building, User as UserIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import ConfirmModal from '@/components/ConfirmModal';

export default function TenantsPage() {
  const { user: currentUser } = useAuth();
  const [tenants, setTenants] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [filterName, setFilterName] = useState('');
  const [filterPhone, setFilterPhone] = useState('');
  const [filterRoom, setFilterRoom] = useState('');
  const [filterOwner, setFilterOwner] = useState('all');

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    setCurrentPage(1);
  }, [filterName, filterPhone, filterRoom, filterOwner]);

  const fetchTenants = async () => {
    try {
      const { data } = await api.get('/tenants');
      setTenants(data);
    } catch (error) {
      toast.error('Failed to fetch tenants');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    if (currentUser?.user_type === 'SA') {
      try {
        const { data } = await api.get('/users');
        setUsers(data);
      } catch (err) {
        console.error('Failed to fetch users', err);
      }
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetchUsers();
    }
  }, [currentUser]);

  const handleDeleteClick = (id: number) => {
    setSelectedTenantId(id);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (selectedTenantId === null) return;
    try {
      await api.delete(`/tenants/${selectedTenantId}`);
      toast.success('Tenant deleted successfully');
      fetchTenants();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to delete tenant');
    } finally {
      setDeleteModalOpen(false);
      setSelectedTenantId(null);
    }
  };

  // Filter logic
  const filteredTenants = tenants.filter((tenant) => {
    const matchesName = tenant.name.toLowerCase().includes(filterName.toLowerCase());
    const matchesPhone = (tenant.phone || '').toLowerCase().includes(filterPhone.toLowerCase());
    const matchesRoom = (tenant.room_no || '').toLowerCase().includes(filterRoom.toLowerCase());
    const matchesOwner = filterOwner === 'all' || tenant.parent_id?.toString() === filterOwner;
    return matchesName && matchesPhone && matchesRoom && matchesOwner;
  });

  const totalItems = filteredTenants.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const paginatedTenants = filteredTenants.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  if (loading) return <div className="text-gray-900 dark:text-white">Loading tenants...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tenants</h1>
            {currentUser?.user_type === 'SA' && (
              <span className="px-2.5 py-0.5 text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 rounded-full flex items-center gap-1">
                <Shield className="h-3 w-3" />
                Super Admin
              </span>
            )}
          </div>
          {currentUser?.user_type === 'SA' && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Super Admin view: Showing and managing all tenants across all property owners/landlords
            </p>
          )}
        </div>
        <Link 
          href="/tenants/new" 
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="h-5 w-5 mr-2" />
          Add Tenant
        </Link>
      </div>

      {/* Filters Form */}
      <div className={`bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 grid grid-cols-1 ${currentUser?.user_type === 'SA' ? 'sm:grid-cols-4' : 'sm:grid-cols-3'} gap-4`}>
        {currentUser?.user_type === 'SA' && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Filter by Landlord / Owner</label>
            <select
              value={filterOwner}
              onChange={(e) => setFilterOwner(e.target.value)}
              className="w-full text-sm rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="all">All Landlords / Owners</option>
              {users.filter((u) => u.user_type === 'A' || u.user_type === 'SA').map((owner) => (
                <option key={owner.id} value={owner.id.toString()}>
                  {owner.name} ({owner.email})
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Search Name</label>
          <input 
            type="text" 
            placeholder="Search by name..." 
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            className="w-full text-sm rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Search Phone</label>
          <input 
            type="text" 
            placeholder="Search by phone..." 
            value={filterPhone}
            onChange={(e) => setFilterPhone(e.target.value)}
            className="w-full text-sm rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Search Room</label>
          <input 
            type="text" 
            placeholder="Search by room..." 
            value={filterRoom}
            onChange={(e) => setFilterRoom(e.target.value)}
            className="w-full text-sm rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </div>
      </div>

      {/* Tenants Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                {currentUser?.user_type === 'SA' && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Owner / Landlord</th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Room</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rent</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date Joined</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {paginatedTenants.length === 0 ? (
                <tr>
                  <td colSpan={currentUser?.user_type === 'SA' ? 7 : 6} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                    No tenants found matching the filters
                  </td>
                </tr>
              ) : (
                paginatedTenants.map((tenant) => {
                  const owner = users.find((u) => u.id === tenant.parent_id);
                  const manager = users.find((u) => u.id === tenant.manager_id);
                  return (
                    <tr key={tenant.id} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-gray-900 dark:text-white">{tenant.name}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">{tenant.phone || 'No phone'}</div>
                      </td>
                      {currentUser?.user_type === 'SA' && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <div className="font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                            <Building className="h-3.5 w-3.5" />
                            {owner ? owner.name : `Admin #${tenant.parent_id}`}
                          </div>
                          {owner?.email && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">{owner.email}</div>
                          )}
                          {manager && (
                            <div className="text-xs text-purple-600 dark:text-purple-400 mt-0.5 flex items-center gap-1">
                              <UserIcon className="h-3 w-3" />
                              Mgr: {manager.name}
                            </div>
                          )}
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300 font-medium">
                        Room {tenant.room_no}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-gray-300">
                        ₹{tenant.rent_amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          tenant.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                        }`}>
                          {tenant.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {tenant.start_date ? format(new Date(tenant.start_date), 'MMM d, yyyy') : 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                        <Link 
                          href={`/tenants/${tenant.id}/edit`} 
                          className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 inline-block"
                          title="Edit Tenant"
                        >
                          <Edit className="h-5 w-5 inline" />
                        </Link>
                        <button 
                          onClick={() => handleDeleteClick(tenant.id)} 
                          className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                          title="Delete Tenant"
                        >
                          <Trash2 className="h-5 w-5 inline" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {totalItems > itemsPerPage && (
          <div className="bg-white dark:bg-gray-800 px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700 dark:text-gray-400">
                  Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, totalItems)}</span> of <span className="font-medium">{totalItems}</span> results
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-3 py-2 rounded-l-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-3 py-2 rounded-r-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
                  >
                    Next
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal 
        isOpen={deleteModalOpen}
        title="Delete Tenant"
        message="Are you sure you want to delete this tenant? This will also remove their historical mapping (but keep payment transactions intact)."
        confirmText="Yes, Delete"
        cancelText="Cancel"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteModalOpen(false)}
        isDangerous={true}
      />
    </div>
  );
}


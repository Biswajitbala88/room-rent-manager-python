'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Plus, Edit, Trash2, DoorOpen, CheckCircle, XCircle, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import ConfirmModal from '@/components/ConfirmModal';

export default function RoomsPage() {
  const { user: currentUser } = useAuth();
  const [rooms, setRooms] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [filterRoomNo, setFilterRoomNo] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  // Modal / Form state for Add/Edit Room
  const [formOpen, setFormOpen] = useState(false);
  const [editRoomId, setEditRoomId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    room_no: '',
    rent_amount: '',
    description: '',
    parent_id: ''
  });

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 9;

  useEffect(() => {
    setCurrentPage(1);
  }, [filterRoomNo, filterStatus]);

  const fetchRooms = async () => {
    try {
      const { data } = await api.get('/rooms');
      setRooms(data);
    } catch (error) {
      toast.error('Failed to fetch rooms');
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
        // ignore
      }
    }
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetchUsers();
    }
  }, [currentUser]);

  const handleOpenAdd = () => {
    setEditRoomId(null);
    setFormData({
      room_no: '',
      rent_amount: '',
      description: '',
      parent_id: ''
    });
    setFormOpen(true);
  };

  const handleOpenEdit = (room: any) => {
    setEditRoomId(room.id);
    setFormData({
      room_no: room.room_no,
      rent_amount: room.rent_amount.toString(),
      description: room.description || '',
      parent_id: room.parent_id ? room.parent_id.toString() : ''
    });
    setFormOpen(true);
  };

  const handleDeleteClick = (id: number) => {
    setSelectedRoomId(id);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (selectedRoomId === null) return;
    try {
      await api.delete(`/rooms/${selectedRoomId}`);
      toast.success('Room deleted successfully');
      fetchRooms();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to delete room');
    } finally {
      setDeleteModalOpen(false);
      setSelectedRoomId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = {
        room_no: formData.room_no,
        rent_amount: parseFloat(formData.rent_amount),
        description: formData.description
      };

      if (currentUser?.user_type === 'SA' && formData.parent_id) {
        payload.parent_id = parseInt(formData.parent_id);
      }

      if (editRoomId) {
        await api.put(`/rooms/${editRoomId}`, payload);
        toast.success('Room updated successfully');
      } else {
        await api.post('/rooms', payload);
        toast.success('Room created successfully');
      }
      setFormOpen(false);
      fetchRooms();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to save room');
    }
  };

  const filteredRooms = rooms.filter((room) => {
    const matchesRoomNo = room.room_no.toLowerCase().includes(filterRoomNo.toLowerCase());
    const matchesStatus = filterStatus === 'all' ? true : room.status === filterStatus;
    return matchesRoomNo && matchesStatus;
  });

  const totalItems = filteredRooms.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const paginatedRooms = filteredRooms.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  if (loading) return <div className="text-gray-900 dark:text-white">Loading rooms...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Room Management</h1>
          {currentUser?.user_type === 'SA' && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Super Admin view: Managing all rooms across all property owners
            </p>
          )}
        </div>
        <button 
          onClick={handleOpenAdd}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="h-5 w-5 mr-2" />
          Add Room
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Search Room No</label>
          <input 
            type="text" 
            placeholder="Search room number..." 
            value={filterRoomNo}
            onChange={(e) => setFilterRoomNo(e.target.value)}
            className="w-full text-sm rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Status</label>
          <select 
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full text-sm rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            <option value="all">All</option>
            <option value="vacant">Vacant</option>
            <option value="occupied">Occupied</option>
          </select>
        </div>
      </div>

      {/* Rooms Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {paginatedRooms.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 col-span-full text-center py-10">No rooms found matching filters.</p>
        ) : (
          paginatedRooms.map((room) => {
            const owner = users.find((u) => u.id === room.parent_id);
            return (
              <div key={room.id} className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                        <DoorOpen className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Room {room.room_no}</h3>
                        <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">₹{room.rent_amount.toFixed(2)}/mo</p>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full items-center gap-1 ${
                      room.status === 'vacant' 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' 
                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                    }`}>
                      {room.status === 'vacant' ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {room.status}
                    </span>
                  </div>

                  {currentUser?.user_type === 'SA' && (
                    <div className="mb-3 text-xs bg-gray-50 dark:bg-gray-750 px-2.5 py-1.5 rounded-lg text-gray-600 dark:text-gray-300 flex items-center justify-between">
                      <span className="font-medium">Owner / Admin:</span>
                      <span className="font-semibold text-blue-600 dark:text-blue-400">
                        {owner ? `${owner.name}` : `User #${room.parent_id}`}
                      </span>
                    </div>
                  )}

                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 line-clamp-2">
                    {room.description || 'No description provided.'}
                  </p>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-750">
                  <button 
                    onClick={() => handleOpenEdit(room)}
                    className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
                    title="Edit Room"
                  >
                    <Edit className="h-5 w-5" />
                  </button>
                  <button 
                    onClick={() => handleDeleteClick(room.id)}
                    className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                    title="Delete Room"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination controls */}
      {totalItems > itemsPerPage && (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm flex items-center justify-between">
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
                  className="relative inline-flex items-center px-3 py-2 rounded-l-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-medium text-gray-500 dark:text-gray-450 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="relative inline-flex items-center px-3 py-2 rounded-r-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-medium text-gray-500 dark:text-gray-450 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
                >
                  Next
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full overflow-hidden p-6 border dark:border-gray-700">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              {editRoomId ? 'Edit Room' : 'Add New Room'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              {currentUser?.user_type === 'SA' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Property Owner / Admin</label>
                  <select
                    value={formData.parent_id}
                    onChange={(e) => setFormData((prev) => ({ ...prev, parent_id: e.target.value }))}
                    className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm"
                  >
                    <option value="">-- Assign to Me (Super Admin) --</option>
                    {users.filter((u) => u.user_type === 'A').map((admin) => (
                      <option key={admin.id} value={admin.id}>
                        {admin.name} ({admin.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Room Number</label>
                <input 
                  type="text" 
                  required 
                  value={formData.room_no} 
                  onChange={(e) => setFormData(prev => ({ ...prev, room_no: e.target.value }))}
                  className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Rent Amount (₹)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  required 
                  value={formData.rent_amount} 
                  onChange={(e) => setFormData(prev => ({ ...prev, rent_amount: e.target.value }))}
                  className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description / Details</label>
                <textarea 
                  value={formData.description} 
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm"
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t dark:border-gray-700">
                <button 
                  type="button" 
                  onClick={() => setFormOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  Save Room
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal 
        isOpen={deleteModalOpen}
        title="Delete Room"
        message="Are you sure you want to delete this room? If this room has active tenants or dependencies, the exact reason will be displayed."
        confirmText="Yes, Delete"
        cancelText="Cancel"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteModalOpen(false)}
        isDangerous={true}
      />
    </div>
  );
}

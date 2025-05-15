// src/hooks/useBodyMetrics.js
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../AuthContext.jsx';
import {
    fetchBodyMetricsEntries,
    addBodyMetricsEntry,
    updateBodyMetricsEntry,
    deleteBodyMetricsEntry
} from '../services/bodyMetricsService.js';

// Helper function to get today's date inYYYY-MM-DD format
const getTodaysDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

const useBodyMetrics = () => {
    // State for fetching and displaying historical entries
    const [entries, setEntries] = useState([]);
    const [fetchLoading, setFetchLoading] = useState(true);
    const [fetchError, setFetchError] = useState('');

    // State for the new entry form and saving process
    const [saveError, setSaveError] = useState('');
    const [saveLoading, setSaveLoading] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');

    // State for editing entries
    const [isEditing, setIsEditing] = useState(false);
    const [editingEntryId, setEditingEntryId] = useState(null);
    const [editFormData, setEditFormData] = useState(null);
    const [editError, setEditError] = useState('');
    const [editMessage, setEditMessage] = useState('');

    const { currentUser } = useAuth();

    // Function to fetch historical entries using the service
    const handleFetchEntries = useCallback(async () => {
        if (!currentUser) {
            setEntries([]);
            setFetchLoading(false);
            setFetchError('');
            console.log('Fetch Entries: No user, clearing entries.');
            return;
        }

        setFetchLoading(true);
        setFetchError('');

        try {
            const fetchedEntries = await fetchBodyMetricsEntries(currentUser.uid);
            setEntries(fetchedEntries);
            setFetchLoading(false);
        } catch (error) {
            console.error('Fetch Entries Error: ', error);
            setFetchError(error.message);
            setFetchLoading(false);
        }
    }, [currentUser]);

    // Effect hook to fetch entries when the component mounts or currentUser changes
    useEffect(() => {
        handleFetchEntries();
    }, [handleFetchEntries]);

    // Function to handle submission of the new entry form using the service
    const handleSubmit = async (entryData) => {
        // Basic client-side validation is assumed to be done before calling this function
        // in the component where the form is rendered.
        // This function focuses on the data saving logic.

        if (!currentUser) {
             setSaveError('Cannot save entry: user not logged in.');
             setSaveMessage('');
             return;
        }

        setSaveError('');
        setSaveMessage('');
        setSaveLoading(true);

        try {
            await addBodyMetricsEntry(currentUser.uid, entryData);

            setSaveMessage('Entry added successfully!');
            console.log('Save Entry: Successful.');

            // Re-fetch entries to update the table and graph
            handleFetchEntries();
        } catch (error) {
            setSaveError(error.message);
            console.error('Save Entry Error: ', error);
            setSaveMessage('');
        }
        setSaveLoading(false);
    };

    // Function to handle clicking the Edit button
    const handleEditClick = (entry) => {
        setIsEditing(true);
        setEditingEntryId(entry.id);

        const formattedDate = entry.date instanceof Date && !isNaN(entry.date.getTime())
            ? entry.date.toISOString().split('T')[0]
            : getTodaysDate();

        const initialEditData = {
            date: formattedDate,
            weight: typeof entry.weight === 'number' ? entry.weight : parseFloat(entry.weight),
            bodyFat: typeof entry.bodyFat === 'number' ? entry.bodyFat : parseFloat(entry.bodyFat),
            weightUnit: entry.weightUnit,
        };

        setEditFormData(initialEditData);

        console.log('handleEditClick: Prepared initial editFormData', initialEditData);
        setEditError('');
        setEditMessage('');
    };

    // Function to handle input changes *within* the edit form
    const handleEditInputChange = (e) => {
        const { name, value } = e.target;
        setEditFormData(prevFormData => ({
            ...prevFormData,
            [name]: value,
        }));
    };

    // Function to handle updating an entry in Firestore using the service
    const handleUpdateEntry = async (updatedData) => {
        if (!currentUser || !editingEntryId) {
            setEditError('Cannot update entry: user not logged in or entry ID missing.');
            console.error('Update Entry Error: User or Entry ID missing.');
            return;
        }

        setEditError('');
        setEditMessage('');
        // Optional: Set a loading state for the save button if you added one

        // Basic validation is assumed to be done before calling this function
        // in the component where the form is rendered.
        // This function focuses on the data saving logic.

        try {
            await updateBodyMetricsEntry(currentUser.uid, editingEntryId, updatedData);

            setEditMessage('Entry updated successfully!');
            console.log(`Update Entry: Successfully updated entry with ID: ${editingEntryId}`);

            handleFetchEntries();

            setTimeout(() => {
                setIsEditing(false);
                setEditingEntryId(null);
                setEditFormData(null);
                setEditMessage('');
                setEditError('');
            }, 1500);

        } catch (error) {
            setEditError(error.message);
            console.error('Update Entry Error: ', error);
            setEditMessage('');
        }
    };

    // Function to handle entry deletion using the service
    const handleDeleteEntry = async (entryId) => {
        if (!currentUser || !entryId) {
            console.error('Delete Entry: No user or entry ID provided.');
            return;
        }

        if (window.confirm('Are you sure you want to delete this entry?')) {
            try {
                await deleteBodyMetricsEntry(currentUser.uid, entryId);
                console.log(`Delete Entry: Successfully deleted entry with ID: ${entryId}`);
                handleFetchEntries();
            } catch (error) {
                console.error('Delete Entry Error: ', error);
                 setFetchError(error.message);
            }
        }
    };

    // Function to cancel editing
    const handleCancelEdit = () => {
        setIsEditing(false);
        setEditingEntryId(null);
        setEditFormData(null);
        setEditError('');
        setEditMessage('');
    };


    return {
        entries,
        fetchLoading,
        fetchError,
        saveError,
        saveLoading,
        saveMessage,
        isEditing,
        editingEntryId,
        editFormData,
        editError,
        editMessage,
        handleFetchEntries, // Although fetched on mount, expose if needed elsewhere
        handleSubmit,
        handleEditClick,
        handleEditInputChange,
        handleUpdateEntry,
        handleDeleteEntry,
        handleCancelEdit,
        currentUser, // Return currentUser from the hook
        // Expose state setters from the hook if needed for local form validation messages
        setSaveError, // Expose setter
        setSaveMessage, // Expose setter
        setEditError, // Expose setter
        setEditMessage, // Expose setter
    };
};

export default useBodyMetrics;
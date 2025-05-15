// src/services/bodyMetricsService.js

import { db } from '../firebase';
import {
    collection,
    addDoc,
    serverTimestamp,
    query,
    orderBy,
    getDocs,
    deleteDoc,
    doc,
    updateDoc
} from 'firebase/firestore';

/**
 * Fetches all body metrics for a given user from Firestore.
 * Entries are ordered by date ascending.
 * @param {string} userId - The ID of the current user
 * @returns {Promise<Array<Object>>} A promise that resolves with an array of entry objects
 * @throws {Error} If fetching fails
 */
export const fetchBodyMetricsEntries = async (userId) => {
    if (!userId) {
        console.log('fetchBodyMetricsEntries: No user ID provided.');
        return [];  // Return empty array if no user ID
    }

    console.log('fetchBodyMetricsEntries: Attempting to fetch for user:', userId);

    try {
        const userMetricsCollectionRef = collection(
            db,
            'users',
            userId, // Use the provided user ID
            'bodyMetricsEntries'
        );

        const q = query(userMetricsCollectionRef, orderBy('date', 'asc'));

        const querySnapshot = await getDocs(q);

        const fetchedEntries = [];
        querySnapshot.forEach((document) => {
            const data = document.data();

            // Attempt to convert Firestore Timestamp to Date object
            const processedDate = data.date && typeof data.date.toDate === 'function' ? data.date.toDate() : null;

            fetchedEntries.push({
                id: document.id, // Include the document ID
                date: processedDate, // Use the processed Date object
                weight: data.weight,
                bodyFat: data.bodyFat,
                weightUnit: data.weightUnit,
                createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt // Convert createdAt too if it exists
            });
        });

        console.log('fetchBodyMetricsEntries: Fetched successfully. Number of entries:', fetchedEntries.length);
        return fetchedEntries;
    } catch (error) {
        console.error('fetchBodyMetricsEntries Error: ', error);
        throw new Error('Failed to fetch entries: ' + error.message); // Re-throw to be caught by the component
    }
};

/**
 * Adds a new body metrics entry for a given user to Firestore
 * @param {string} userId - The ID of the current user
 * @param {Object} entryData - The data for the new entry (date, weight, bodyFat, weightUnit)
 * @returns {Promise<void>} A promise that resolves when the entry is added
 * @throws {Error} If adding fails
 */
export const addBodyMetricsEntry = async (userId, entryData) => {
    if (!userId) {
        throw new Error('addBodyMetricsEntry: No user ID provided.');
    }
    if (!entryData || !entryData.date || !entryData.weight || !entryData.bodyFat || !entryData.weightUnit) {
         throw new Error('addBodyMetricsEntry: Invalid entry data provided.');
    }

    console.log('addBodyMetricsEntry: Attempting to add entry for user:', userId, 'Data:', entryData);

    try {
        const userMetricsCollectionRef = collection(
            db,
            'users',
            userId,
            'bodyMetricsEntries'
        );

        await addDoc(userMetricsCollectionRef, {
            ...entryData, // Spread the provided entry data
            createdAt: serverTimestamp(), // Add server timestamp
        });

        console.log('addBodyMetricsEntry: Entry added successfully.');
    } catch (error) {
        console.error('addBodyMetricsEntry Error: ', error);
        throw new Error('Failed to save entry: ' + error.message); // Re-throw
    }
};

/**
 * Updates an existing body metrics entry for a given user in Firestore.
 * @param {string} userId - The ID of the current user.
 * @param {string} entryId - The ID of the entry to update.
 * @param {Object} updatedData - The updated data for the entry (date, weight, bodyFat).
 * @returns {Promise<void>} A promise that resolves when the entry is updated.
 * @throws {Error} If updating fails.
 */
export const updateBodyMetricsEntry = async (userId, entryId, updatedData) => {
    if (!userId || !entryId) {
        throw new Error('updateBodyMetricsEntry: User ID or Entry ID missing.');
    }
    if (!updatedData || !updatedData.date || !updatedData.weight || !updatedData.bodyFat) {
        throw new Error('updateBodyMetricsEntry: Invalid updated data provided.');
    }

    console.log('updateBodyMetricsEntry: Attempting to update entry:', entryId, 'for user:', userId, 'Data:', updatedData);

    try {
        const entryRef = doc(
            db,
            'users',
            userId,
            'bodyMetricsEntries',
            entryId
        );

        await updateDoc(entryRef, updatedData);

        console.log(`updateBodyMetricsEntry: Successfully updated entry with ID: ${entryId}`);
    } catch (error) {
        console.error('updateBodyMetricsEntry Error: ', error);
        throw new Error('Failed to update entry: ' + error.message); // Re-throw
    }
};

/**
 * Deletes a body metrics entry for a given user from Firestore.
 * @param {string} userId - The ID of the current user.
 * @param {string} entryId - The ID of the entry to delete.
 * @returns {Promise<void>} A promise that resolves when the entry is deleted.
 * @throws {Error} If deletion fails.
 */
export const deleteBodyMetricsEntry = async (userId, entryId) => {
    if (!userId || !entryId) {
        throw new Error('deleteBodyMetricsEntry: User ID or Entry ID missing.');
    }

    console.log('deleteBodyMetricsEntry: Attempting to delete entry:', entryId, 'for user:', userId);

    try {
        const entryRef = doc(
            db,
            'users',
            userId,
            'bodyMetricsEntries',
            entryId
        );

        await deleteDoc(entryRef);

        console.log(`deleteBodyMetricsEntry: Successfully deleted entry with ID: ${entryId}`);
    } catch (error) {
        console.error('deleteBodyMetricsEntry Error: ', error);
        throw new Error('Failed to delete entry: ' + error.message); // Re-throw
    }
};
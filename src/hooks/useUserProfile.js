// src/hooks/useUserProfile.js
import { useStage, useEffect, useCallback, useState } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

const useUserProfile = (userId) => {
    // State for user profile data
    const [userProfile, setUserProfile] = useState(null);
    const [profileLoading, setProfileLoading] = useState(true);
    const [profileError, setProfileError] = useState('');
    const [profileMessage, setProfileMessage] = useState('');
    const [saveProfileLoading, setSaveProfileLoading] = useState(false);

    // Function to fetch user profile data
    const fetchUserProfile = useCallback(async () => {
        if (!userId) {
            setUserProfile(null);
            setProfileLoading(false);
            setProfileError('');
            console.log('Fetch Profile: No user ID.');
            return;
        }

        setProfileLoading(true);
        setProfileError('');

        try {
            const userProfileRef = doc(db, 'users', userId, 'profile', 'data'); // Document path for profile data
            const docSnap = await getDoc(userProfileRef);

            if (docSnap.exists()) {
                const profileData = docSnap.data();
                // Convert Firestore Timestamp to Date object for dateOfBirth
                const processedDateOfBirth = profileData.dateOfBirth && typeof profileData.dateOfBirth.toDate === 'function' ? profileData.dateOfBirth.toDate() : null;

                setUserProfile({
                    ...profileData,
                    dateOfBirth: processedDateOfBirth,  // Use the processed Date object
                });
                console.log('Fetch Profile: Profile data found and set.');
            } else {
                // Profile document doesn't exist yet
                setUserProfile(null);
                console.log('Fetch Profile: No profile data found.');
            }
            setProfileLoading(false);
        } catch (error) {
            console.error('Fetch Profile Error:', error);
            setProfileError('Failed to fetch profile: ' + error.message);
            setUserProfile(null);
            setProfileLoading(false);
        }
    }, [userId]);   // Dependency array includes userId

    // Effect to fetch profile data when the hook is used or userId changes
    useEffect(() => {
        fetchUserProfile();
    }, [fetchUserProfile]); // Dependency array includes fetchUserProfile

    // Function to save user profile data
    const saveProfile = async (profileData) => {
        if (!userId) {
            setProfileError('Cannot save profile: user ID missing.');
            setProfileMessage('');
            return;
        }

        setSaveProfileLoading(true);
        setProfileError('');
        setProfileMessage('');
        
        try {
            const userProfileRef = doc(db, 'users', userId, 'profile', 'data'); // Document path for profile data

            // Use setDoc with merge: true to create or update the document
            await setDoc(userProfileRef, {
                ...profileData,
                updatedAt: serverTimestamp(),   // Add or update timestamp on save
            }, { merge: true });    // Use merge to avoid overwriting other fields if they exist

            setProfileMessage('Profile saved successfully.');
            console.log('Save Profile: Successful.');

            // Re-fetch profile data to update the table and graph
            fetchUserProfile();

            // Clear success message after a delay
            setTimeout(() => {
                setProfileMessage('');
            }, 3000);
        } catch (error) {
            console.error('Save Profile Error:', error);
            setProfileError('Failed to save profile: ' + error.message);
            setProfileMessage('');
        }
        setSaveProfileLoading(false);
    };

    return {
        userProfile,
        profileLoading,
        profileError,
        profileMessage,
        saveProfileLoading,
        saveProfile,    // Expose the save function
        setProfileError,    // Expose setter for local validation messages in component
        setProfileMessage,  // Expose setter for local success messages in component
        fetchUserProfile,    // Expose the fetch function if needed elsewhere, though useEffect handles primary fetch
    };
};

export default useUserProfile;
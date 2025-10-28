import {
    doc,
    getDoc,
    setDoc,
    collection,
    addDoc,
    onSnapshot,
    query,
    writeBatch,
    where,
    getDocs,
    deleteDoc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db } from './firebase.js';
import { AuthService } from './auth.js';

export const DBService = {
    _getCollectionPath(collectionName) {
        const appId = 'atlas-ef533';
        const userId = AuthService.currentUser?.uid;
        if (!userId) throw new Error("Usuário não autenticado para acesso ao DB.");
        return `/artifacts/${appId}/users/${userId}/${collectionName}`;
    },

    _getProfileDocRef(userId) {
        const appId = 'atlas-ef533';
        if (!userId) throw new Error("UserID é necessário para o caminho do perfil.");
        return doc(db, 'artifacts', appId, 'users', userId, 'profile', 'info');
    },

    async getUserProfile(userId) {
        const docRef = this._getProfileDocRef(userId);
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? docSnap.data() : null;
    },
    createUserProfile(userId, data) {
        const docRef = this._getProfileDocRef(userId);
        return setDoc(docRef, data);
    },
    updateUserProfile(userId, data) {
        const docRef = this._getProfileDocRef(userId);
        return updateDoc(docRef, { name: data.name, address: data.address });
    },

    listenToCollection(collectionName, callback) {
        try {
            const q = query(collection(db, this._getCollectionPath(collectionName)));
            return onSnapshot(q, (querySnapshot) => {
                const data = [];
                querySnapshot.forEach((doc) => {
                    data.push({ id: doc.id, ...doc.data() });
                });
                callback(data);
            });
        } catch (error) {
            console.error(`Error listening to ${collectionName}:`, error);
            return () => { }; // Return an empty unsubscribe function
        }
    },
    addItem: (collectionName, data) => addDoc(collection(db, DBService._getCollectionPath(collectionName)), data),
    updateItem: (collectionName, id, data) => updateDoc(doc(db, DBService._getCollectionPath(collectionName), id), data),
    deleteItem: (collectionName, id) => deleteDoc(doc(db, DBService._getCollectionPath(collectionName), id)),

    async deleteClientAndRelatedData(clientId) {
        const batch = writeBatch(db);
        batch.delete(doc(db, this._getCollectionPath('clients'), clientId));
        const salesQuery = query(collection(db, this._getCollectionPath('sales')), where("clientId", "==", clientId));
        const salesSnapshot = await getDocs(salesQuery);
        for (const saleDoc of salesSnapshot.docs) {
            batch.delete(saleDoc.ref);
            const installmentsQuery = query(collection(db, this._getCollectionPath('installments')), where("saleId", "==", saleDoc.id));
            const installmentsSnapshot = await getDocs(installmentsQuery);
            installmentsSnapshot.forEach(instDoc => batch.delete(instDoc.ref));
        }
        await batch.commit();
    }
};
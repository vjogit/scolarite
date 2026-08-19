import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { apiInstance } from "../../services/api";
import { ENDPOINT_USER, USER } from "./def";
import { IconButton, Tooltip } from "@mui/material";
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useNotifications } from '@toolpad/core/useNotifications';
import { notifyError, notifySuccess } from '../../services/notify';


export function UserImportButton() {

    const notifications = useNotifications();
    const queryClient = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            await apiInstance.post(`${ENDPOINT_USER}/import`, formData);
            queryClient.invalidateQueries({ queryKey: [USER] });
            notifySuccess(notifications, "Import des utilisateurs réussi.");
        } catch (error) {
            console.error("Import failed", error);
            notifyError(notifications, "Erreur lors de l'import.");
        } finally {
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    }, [notifications, queryClient])

    return (
        <>
            <Tooltip title="Import">
                <IconButton onClick={() => fileInputRef.current?.click()}>
                    <UploadFileIcon />
                </IconButton>
            </Tooltip>
            <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileChange}
                accept=".yaml,.yml"
            />
        </>
    )

}
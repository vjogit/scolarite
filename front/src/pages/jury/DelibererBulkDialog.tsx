import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, FormControlLabel, Switch, Typography,
    List, ListItem, ListItemText, CircularProgress, Divider, Box,
} from '@mui/material';
import GavelIcon from '@mui/icons-material/Gavel';
import { useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────

export interface BulkStudent {
    userId: number;
    name: string;
}

interface Props {
    open: boolean;
    students: BulkStudent[];
    loading: boolean;
    onClose: () => void;
    /** Appelé avec la liste des élèves à délibérer + leur compte_cumul */
    onConfirm: (entries: { user_id: number; compte_cumul: boolean }[]) => void;
}

export function DelibererBulkDialog({ open, students, loading, onClose, onConfirm }: Props) {
    // compte_cumul global (appliqué à tous)
    const [compteCumul, setCompteCumul] = useState(true);

    const handleConfirm = () => {
        onConfirm(students.map(s => ({ user_id: s.userId, compte_cumul: compteCumul })));
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>Délibérer {students.length} élève{students.length > 1 ? 's' : ''}</DialogTitle>
            <DialogContent>
                <FormControlLabel
                    control={
                        <Switch
                            checked={compteCumul}
                            onChange={e => setCompteCumul(e.target.checked)}
                        />
                    }
                    label={
                        <span>
                            Compter dans le GPA cumulé
                            <Typography variant="caption" display="block" color="text.secondary">
                                Décocher si l'année échouée ne doit pas compter (redoublants)
                            </Typography>
                        </span>
                    }
                    sx={{ mb: 1 }}
                />
                <Divider sx={{ mb: 1 }} />
                <Box sx={{ maxHeight: 260, overflowY: 'auto' }}>
                    <List dense disablePadding>
                        {students.map(s => (
                            <ListItem key={s.userId} disableGutters>
                                <ListItemText primary={s.name} />
                            </ListItem>
                        ))}
                    </List>
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={loading}>Annuler</Button>
                <Button
                    variant="contained"
                    onClick={handleConfirm}
                    disabled={loading || students.length === 0}
                    startIcon={loading ? <CircularProgress size={16} /> : <GavelIcon />}
                >
                    Confirmer
                </Button>
            </DialogActions>
        </Dialog>
    );
}

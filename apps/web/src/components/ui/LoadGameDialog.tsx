'use client';
import { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import DeleteIcon from '@mui/icons-material/Delete';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import BlockIcon from '@mui/icons-material/Block';
import { deleteSave, readAllSaves, checkSaveCompatibility, type SaveData } from '@fm2k/backend';
import { useGameStore } from '@/store/game-store';

function formatSaveDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function LoadGameDialog({ open, onClose }: Props) {
  const loadGame = useGameStore((s) => s.loadGame);
  const [saves, setSaves] = useState<SaveData[]>([]);

  const loadSaves = async () => {
    setSaves(await readAllSaves());
  };

  const handleDelete = async (save: SaveData) => {
    await deleteSave(save.type, save.teamName);
    await loadSaves();
  };

  const handleLoad = (save: SaveData) => {
    loadGame(save);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onTransitionEnter={loadSaves}
      maxWidth="sm"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: 3 } } }}
    >
      <DialogTitle sx={{ fontWeight: 700 }}>Load Game</DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        {saves.length === 0 ? (
          <Box sx={{ px: 3, py: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">No saves found.</Typography>
          </Box>
        ) : (
          saves.map((save, i) => {
            const compat = checkSaveCompatibility(save);
            const isIncompatible = compat === 'incompatible';
            const isOutdated = compat === 'outdated';
            return (
              <Box key={`${save.type}-${save.teamName}`}>
                {i > 0 && <Divider />}
                <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.5, gap: 1.5 }}>
                  <Chip
                    label={save.type}
                    size="small"
                    color={save.type === 'QUICK' ? 'primary' : 'secondary'}
                    sx={{ minWidth: 56, fontWeight: 700 }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {save.teamName} — Matchday {save.matchday}
                      </Typography>
                      {isIncompatible && (
                        <Tooltip title="This save was created with an incompatible version of the game and cannot be loaded.">
                          <Chip
                            icon={<BlockIcon />}
                            label="Incompatible"
                            size="small"
                            color="error"
                            variant="outlined"
                          />
                        </Tooltip>
                      )}
                      {isOutdated && (
                        <Tooltip title="This save was created with an older version of the game. It can still be loaded but some data may be missing.">
                          <Chip
                            icon={<WarningAmberIcon />}
                            label="Outdated"
                            size="small"
                            color="warning"
                            variant="outlined"
                          />
                        </Tooltip>
                      )}
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {formatSaveDate(save.savedAt)}
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={isIncompatible}
                    onClick={() => handleLoad(save)}
                  >
                    Load
                  </Button>
                  <IconButton size="small" color="error" onClick={() => handleDelete(save)} aria-label="Delete save">
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
            );
          })
        )}
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}

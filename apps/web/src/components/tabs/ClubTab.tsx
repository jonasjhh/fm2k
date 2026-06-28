import { useState } from 'react';
import Box from '@mui/material/Box';
import { useGameStore } from '@/store/game-store';
import { useShallow } from 'zustand/react/shallow';
import { fmt } from '../../utils/formatting';
import { SectionHeader } from '@fm2k/design-system';
import { ButtonSelector } from '../ui/ButtonSelector';
import { SelectorPanel } from '../ui/SelectorPanel';
import StadiumSubPage from '../club/StadiumSubPage';
import MedicalSubPage from '../club/MedicalSubPage';
import TrainingSubPage from '../club/TrainingSubPage';
import AcademySubPage from '../club/AcademySubPage';
import KitSubPage from '../club/KitSubPage';

type SubPage = 'stadium' | 'kit' | 'medical' | 'training' | 'academy';

const SUB_PAGES: { id: SubPage; label: string }[] = [
  { id: 'stadium', label: 'Stadium' },
  { id: 'kit', label: 'Kit' },
  { id: 'medical', label: 'Medical Clinic' },
  { id: 'training', label: 'Training Facilities' },
  { id: 'academy', label: 'Youth Academy' },
];

export default function ClubTab() {
  const clubState = useGameStore(useShallow((s) => s.clubState));
  const [sub, setSub] = useState<SubPage>('stadium');
  if (!clubState) {return null;}

  return (
    <Box>
      <SectionHeader
        title="Club"
        subtitle={(
          <>
            Budget: <strong>£{fmt(clubState.budget)}</strong>
            {clubState.facilityDeficitStreak > 0 && (
              <> — budget in deficit, facilities will be mothballed next week if this isn't resolved</>
            )}
          </>
        )}
      />

      <SelectorPanel>
        <ButtonSelector<SubPage>
          label="Section"
          value={sub}
          onChange={setSub}
          options={SUB_PAGES.map((p) => ({ value: p.id, label: p.label }))}
        />
      </SelectorPanel>

      {sub === 'stadium' && <StadiumSubPage />}
      {sub === 'kit' && <KitSubPage />}
      {sub === 'medical' && <MedicalSubPage />}
      {sub === 'training' && <TrainingSubPage />}
      {sub === 'academy' && <AcademySubPage />}
    </Box>
  );
}

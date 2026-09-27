import { useHotkeys } from 'react-hotkeys-hook';

// "n" opens a list page's create panel. react-hotkeys-hook ignores
// keypresses inside inputs/textareas/selects by default, so this never
// fights with typing a requisition title, vendor name, etc.
export function useNewHotkey(onNew: () => void) {
  useHotkeys('n', (e) => {
    e.preventDefault();
    onNew();
  });
}

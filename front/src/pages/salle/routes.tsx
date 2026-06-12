import { createCrudRoutes, type CrudComponentProps } from '../../services/crud/routes';
import { SALLE, SALLE_WORKFLOW } from './def';
import { CrudSalle } from './Salle';

export function createSalleRoutes() {
    return [
        createCrudRoutes(SALLE, CustomCrudSalle),
    ];
}

function CustomCrudSalle({ mode }: CrudComponentProps) {
    return (
        <CrudSalle
            workflow={SALLE_WORKFLOW}
            mode={mode}
            isAction={true}
            isTopToolbar={true}
        />
    );
}

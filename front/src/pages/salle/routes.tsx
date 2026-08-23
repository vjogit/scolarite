import { createCrudRoutes } from '../../services/crud/routes';
import { SALLE } from './def';
import { CustomCrudSalle } from './CustomCrudSalle';

export function createSalleRoutes() {
    return [
        createCrudRoutes(SALLE, CustomCrudSalle),
    ];
}

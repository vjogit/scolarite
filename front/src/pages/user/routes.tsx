import { createCrudRoutes } from '../../services/crud/routes';
import { USER } from './def';
import { CustomCrudUser } from './CustomCrudUser';

export function createUserRoutes() {

    const userPath = USER;

    return [
        createCrudRoutes(userPath, CustomCrudUser),
    ]

}

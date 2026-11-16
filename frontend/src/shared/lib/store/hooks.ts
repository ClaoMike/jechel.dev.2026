import { useDispatch, useSelector } from 'react-redux'

/** Typed versions of react-redux's hooks: use these, not the plain ones. RootState and AppDispatch are the app's store's (app/store). */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
export const useAppSelector = useSelector.withTypes<RootState>()

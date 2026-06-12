package services

type ContextKey struct {
	Name string
}

func (k *ContextKey) String() string {
	return "context value: " + k.Name
}

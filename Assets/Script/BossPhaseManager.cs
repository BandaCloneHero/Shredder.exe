using UnityEngine;
using YARG;

/// <summary>
/// Compatibility component for existing scenes. Gepeto now has one health bar
/// and is defeated when that bar reaches zero; phases never restore health.
/// </summary>
public class BossPhaseManager : MonoBehaviour
{
    [SerializeField] private BossHealthBar bossHealthBar;

    private void Awake()
    {
        if (bossHealthBar == null)
            bossHealthBar = GetComponent<BossHealthBar>();
    }
}
